"""Check that privileged critic loss cannot leak gradients into the public actor."""

import importlib.util
from pathlib import Path
import torch

spec = importlib.util.spec_from_file_location(
    "model", Path(__file__).with_name("train-information-model.py")
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
model = m.InformationModel()
state = torch.randn(2, 109)
history = torch.randn(2, 3, 32)
lengths = torch.tensor([3, 2])
actions = torch.randn(5, 24)
owners = torch.tensor([0, 0, 1, 1, 1])
private = torch.randn(2, 7)
b = (state, history, lengths, actions, owners, private)
a = model(b)
changed = model((*b[:-1], private + 100))
for index in range(4):
    torch.testing.assert_close(a[index], changed[index], rtol=0, atol=0)
a[-1].square().sum().backward()
for name, p in model.named_parameters():
    if not name.startswith("critic."):
        assert p.grad is None or p.grad.count_nonzero() == 0, name
assert any(
    p.grad is not None and p.grad.count_nonzero() > 0 for p in model.critic.parameters()
)
print(
    "Privileged inputs cannot alter actor outputs or send critic gradients into actor parameters."
)
