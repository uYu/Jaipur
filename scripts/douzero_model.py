"""DouZero-shaped action-value network for Jaipur research, not game runtime."""
import torch
from torch import nn

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
