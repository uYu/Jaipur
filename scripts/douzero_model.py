"""DouZero-shaped action-value network for Jaipur research, not game runtime."""
import torch
from torch import nn
import numpy as np

STATE_ACTION_FEATURES = 170
HISTORY_LENGTH = 16
HISTORY_FEATURES = 26


class JaipurDouZero(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(HISTORY_FEATURES, 128, batch_first=True)
        layers = []
        width = STATE_ACTION_FEATURES + 128
        for _ in range(5):
            layers.extend((nn.Linear(width, 512), nn.ReLU()))
            width = 512
        layers.append(nn.Linear(width, 1))
        self.mlp = nn.Sequential(*layers)

    def forward(self, history: torch.Tensor, state_action: torch.Tensor):
        if history.ndim != 3 or history.shape[1:] != (HISTORY_LENGTH, HISTORY_FEATURES):
            raise ValueError("Expected [batch, 16, 26] public history")
        if state_action.ndim != 2 or state_action.shape != (history.shape[0], STATE_ACTION_FEATURES):
            raise ValueError("Expected [batch, 170] state-action features")
        encoded, _ = self.lstm(history)
        return self.mlp(torch.cat((encoded[:, -1], state_action), dim=1))

    def score_actions(self, history: torch.Tensor, state: torch.Tensor,
                      actions: torch.Tensor):
        """Encode one public history once, then score every legal action."""
        if history.shape != (1, HISTORY_LENGTH, HISTORY_FEATURES):
            raise ValueError("Expected one public history")
        if state.shape != (146,) or actions.ndim != 2 or actions.shape[1] != 24:
            raise ValueError("Bad state or action features")
        encoded, _ = self.lstm(history)
        x = torch.cat((state.expand(len(actions), -1), actions), dim=1)
        h = encoded[:, -1].expand(len(actions), -1)
        return self.mlp(torch.cat((h, x), dim=1)).squeeze(1)

    def score_rows(self, history: torch.Tensor, states: torch.Tensor,
                   actions: torch.Tensor, lengths: list[int]):
        """Score several games in one forward pass, useful for GPU actors."""
        if history.ndim != 3 or history.shape[1:] != (HISTORY_LENGTH, HISTORY_FEATURES):
            raise ValueError("Expected [games, 16, 26] public history")
        if states.shape != (len(history), 146) or len(lengths) != len(history):
            raise ValueError("Bad batched states")
        if actions.ndim != 2 or actions.shape != (sum(lengths), 24) or any(n < 1 for n in lengths):
            raise ValueError("Bad batched actions")
        encoded, _ = self.lstm(history)
        counts = torch.tensor(lengths, device=history.device)
        h = torch.repeat_interleave(encoded[:, -1], counts, dim=0)
        s = torch.repeat_interleave(states, counts, dim=0)
        return self.mlp(torch.cat((h, s, actions), dim=1)).squeeze(1)


class JaipurHierarchical(nn.Module):
    """Choose action kind, exchange target, then the concrete legal action."""

    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(HISTORY_FEATURES, 128, batch_first=True)
        self.context = nn.Sequential(nn.Linear(146 + 128, 512), nn.ReLU())
        self.kind_head = nn.Linear(512, 4)
        self.target_head = nn.Sequential(
            nn.Linear(512 + 6, 256), nn.ReLU(), nn.Linear(256, 1))
        layers = []
        width = 512 + 24
        for _ in range(4):
            layers.extend((nn.Linear(width, 512), nn.ReLU()))
            width = 512
        layers.append(nn.Linear(width, 1))
        self.action_head = nn.Sequential(*layers)

    def encode(self, history: torch.Tensor, state: torch.Tensor):
        encoded, _ = self.lstm(history)
        return self.context(torch.cat((encoded[:, -1], state), dim=1))

    def training_scores(self, history: torch.Tensor, state_action: torch.Tensor):
        context = self.encode(history, state_action[:, :146])
        actions = state_action[:, 146:]
        kind = actions[:, :4].argmax(dim=1)
        kind_value = self.kind_head(context).gather(1, kind[:, None]).squeeze(1)
        target_value = self.target_head(torch.cat((context, actions[:, 4:10]), dim=1)).squeeze(1)
        action_value = self.action_head(torch.cat((context, actions), dim=1)).squeeze(1)
        return kind_value, target_value, action_value, kind

    def score_actions(self, history: torch.Tensor, state: torch.Tensor,
                      actions: torch.Tensor):
        context = self.encode(history, state[None]).expand(len(actions), -1)
        return self.action_head(torch.cat((context, actions), dim=1)).squeeze(1)

    def choose_rows(self, histories, states, action_rows, epsilon, rng):
        """Score only the chosen kind/target at the concrete-action stage."""
        with torch.inference_mode():
            contexts = self.encode(torch.from_numpy(histories),
                                   torch.from_numpy(states))
            kinds = self.kind_head(contexts).numpy()
            indices, values = [], []
            for row, actions in enumerate(action_rows):
                action_kind = actions[:, :4].argmax(axis=1)
                available = np.unique(action_kind)
                exploratory = rng.random() < epsilon
                kind = (int(rng.choice(available)) if exploratory else
                        int(available[np.argmax(kinds[row, available])]))
                eligible = np.flatnonzero(action_kind == kind)
                if kind == 3:
                    targets, inverse = np.unique(actions[eligible, 4:10],
                                                 axis=0, return_inverse=True)
                    if exploratory:
                        target = int(rng.integers(len(targets)))
                    else:
                        repeated = contexts[row:row + 1].expand(len(targets), -1)
                        features = torch.from_numpy(targets)
                        q = self.target_head(torch.cat((repeated, features), dim=1)).squeeze(1).numpy()
                        target = int(np.argmax(q))
                    eligible = eligible[inverse == target]
                if exploratory:
                    chosen = int(rng.choice(eligible))
                    value = 0.0
                else:
                    repeated = contexts[row:row + 1].expand(len(eligible), -1)
                    features = torch.from_numpy(actions[eligible])
                    q = self.action_head(torch.cat((repeated, features), dim=1)).squeeze(1).numpy()
                    position = int(rng.choice(np.flatnonzero(q == q.max())))
                    chosen = int(eligible[position])
                    value = float(q[position])
                indices.append(chosen)
                values.append(value)
            return indices, values
