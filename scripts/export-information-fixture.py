import importlib.util
import json
import shutil
import sys
from pathlib import Path
import torch

spec = importlib.util.spec_from_file_location(
    "model", Path(__file__).with_name("train-information-model.py")
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
directory = Path(sys.argv[1])
source = Path(sys.argv[2])
model = m.InformationModel()
model.load_state_dict(
    torch.load(directory / "model.pt", weights_only=True)["state_dict"]
)
model.eval()
row = next(
    m.tensor_row(json.loads(line))
    for line in (source / "dev.jsonl").open()
    if len(json.loads(line)["history"]) > 10
)
b, *_ = m.batch([row])
with torch.no_grad():
    pi, mu, v, _, _ = model(b)
fixture = {
    k: (x.tolist() if isinstance(x, torch.Tensor) else x) for k, x in row.items()
}
fixture.update(logits=pi.tolist(), opponent_logits=mu.tolist(), value=v.item())
(directory / "parity.json").write_text(json.dumps(fixture) + "\n")
shutil.copyfile(source / "dataset.json", directory / "dataset.json")
