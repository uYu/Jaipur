"""Draw the implemented Jaipur DouZero-style network as a vector paper figure."""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUT = Path(__file__).resolve().parents[1] / "output/pdf/jaipur_douzero_architecture.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
W, H = 1120, 520

NAVY = HexColor("#14213D")
INK = HexColor("#263449")
MUTED = HexColor("#526174")
RULE = HexColor("#CED8E4")
BLUE = HexColor("#2A6FAD")
BLUE_PALE = HexColor("#EDF5FC")
TEAL = HexColor("#187F78")
TEAL_PALE = HexColor("#EAF7F4")
ORANGE = HexColor("#BA6A18")
ORANGE_PALE = HexColor("#FFF4E6")
PURPLE = HexColor("#6852A3")
PURPLE_PALE = HexColor("#F3F0FA")
GRAY_PALE = HexColor("#F5F7FA")

c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
c.setTitle("Jaipur DouZero-style action-value network")
c.setAuthor("Jaipur AI research")


def text(x, y, value, size=12, color=INK, bold=False, center=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFont(font, size)
    c.setFillColor(color)
    if center:
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)


def box(x, y, w, h, fill, border, radius=11, line_width=1.3):
    c.setFillColor(fill)
    c.setStrokeColor(border)
    c.setLineWidth(line_width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def arrow(points, color=RULE, width=2, dashed=False, head=8):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.setDash(5, 4) if dashed else c.setDash()
    path = c.beginPath()
    path.moveTo(*points[0])
    for p in points[1:]:
        path.lineTo(*p)
    c.drawPath(path)
    c.setDash()
    x0, y0 = points[-2]
    x1, y1 = points[-1]
    if abs(x1 - x0) >= abs(y1 - y0):
        sign = 1 if x1 > x0 else -1
        triangle = [(x1, y1), (x1 - sign * head, y1 + head * .48),
                    (x1 - sign * head, y1 - head * .48)]
    else:
        sign = 1 if y1 > y0 else -1
        triangle = [(x1, y1), (x1 + head * .48, y1 - sign * head),
                    (x1 - head * .48, y1 - sign * head)]
    p = c.beginPath()
    p.moveTo(*triangle[0])
    for point in triangle[1:]:
        p.lineTo(*point)
    p.close()
    c.drawPath(p, fill=1, stroke=0)


# Header and section guide.
text(40, 482, "JAIPUR  |  DOUZERO-STYLE ACTION-VALUE NETWORK", 17, NAVY, True)
text(40, 458, "One shared public-history encoder and one shared Q network score every complete legal action.",
     12.3, MUTED)
c.setStrokeColor(RULE)
c.setLineWidth(1)
c.line(40, 445, 1080, 445)

# Observable inputs.
box(40, 318, 260, 108, TEAL_PALE, TEAL)
text(56, 399, "PUBLIC ACTION HISTORY", 13.6, TEAL, True)
text(56, 376, "Last 16 moves, 26 features each", 12.2)
text(56, 357, "2 actor-relative + 24 action", 11.8, MUTED)
text(56, 338, "Left pad; reset at each round", 11.8, MUTED)

box(40, 208, 260, 91, BLUE_PALE, BLUE)
text(56, 272, "CURRENT OBSERVATION", 13.6, BLUE, True)
text(56, 250, "146 public features", 12.2)
text(56, 231, "Hand, market, tokens, belief, seals", 11.8, MUTED)

box(40, 95, 260, 95, ORANGE_PALE, ORANGE)
text(56, 164, "LEGAL ACTION  a_i", 13.6, ORANGE, True)
text(56, 143, "4 type + 6 take + 6 give", 11.8)
text(56, 123, "+ 1 sale count + 6 good + 1 camel", 11.5, MUTED)
text(56, 104, "= 24 features per complete action", 11.5, MUTED)

# Shared recurrent encoder.
box(348, 327, 158, 90, TEAL_PALE, TEAL)
text(427, 390, "LSTM", 17, TEAL, True, True)
text(427, 368, "1 layer, 26 -> 128", 12.7, INK, False, True)
text(427, 346, "final hidden state", 11.6, MUTED, False, True)
arrow([(300, 372), (348, 372)], TEAL, 2.2)

# Converging paths and the candidate-wise concatenation.
box(550, 205, 151, 135, PURPLE_PALE, PURPLE)
text(625.5, 309, "CONCATENATE", 13.7, PURPLE, True, True)
text(625.5, 282, "history  128", 12, INK, False, True)
text(625.5, 261, "state     146", 12, INK, False, True)
text(625.5, 240, "action     24", 12, INK, False, True)
c.setStrokeColor(RULE)
c.line(575, 230, 676, 230)
text(625.5, 212, "298 dimensions", 11.8, PURPLE, True, True)
arrow([(506, 372), (525, 372), (525, 294), (550, 294)], TEAL, 2.2)
arrow([(300, 253), (550, 253)], BLUE, 2.2)
arrow([(300, 146), (525, 146), (525, 226), (550, 226)], ORANGE, 2.2)
text(324, 295, "shared once", 10.8, MUTED)
text(360, 157, "repeat for i = 1 ... K", 10.8, MUTED)

# Exactly five hidden dense layers and one scalar output layer.
box(744, 204, 221, 174, PURPLE_PALE, PURPLE)
text(854.5, 352, "SHARED 6-LAYER MLP", 13.7, PURPLE, True, True)
rows = [
    ("FC 1", "298 -> 512", "ReLU"),
    ("FC 2", "512 -> 512", "ReLU"),
    ("FC 3", "512 -> 512", "ReLU"),
    ("FC 4", "512 -> 512", "ReLU"),
    ("FC 5", "512 -> 512", "ReLU"),
    ("FC 6", "512 -> 1", "linear"),
]
for n, (name, dims, activation) in enumerate(rows):
    y = 330 - n * 22
    if n % 2 == 0:
        c.setFillColor(HexColor("#E9E4F5"))
        c.roundRect(757, y - 6, 195, 20, 4, fill=1, stroke=0)
    text(769, y, name, 11.8, PURPLE, True)
    text(817, y, dims, 11.8, INK)
    text(940, y, activation, 11.1, MUTED, False, True)
arrow([(701, 273), (744, 273)], PURPLE, 2.3)

# Per-action values and policy selection.
box(1007, 222, 76, 139, GRAY_PALE, NAVY)
text(1045, 331, "Q(o,a_i)", 13.2, NAVY, True, True)
text(1045, 306, "i = 1..K", 11.7, MUTED, False, True)
for n, label in enumerate(("Q_1", "Q_2", "...", "Q_K")):
    y = 282 - n * 17
    text(1045, y, label, 11.8, INK, False, True)
arrow([(965, 273), (1007, 273)], NAVY, 2.3)
text(854.5, 187, "Total trainable parameters: 1,284,097", 10.9, MUTED, False, True)
text(1045, 199, "Choose argmax Q", 11.2, NAVY, True, True)
text(1045, 183, "epsilon-greedy in self-play", 10.4, MUTED, False, True)

# Training objective, deliberately separated from inference flow.
c.setDash(5, 4)
c.setStrokeColor(RULE)
c.setFillColor(GRAY_PALE)
c.setLineWidth(1.1)
c.roundRect(40, 28, 1043, 57, 10, fill=1, stroke=1)
c.setDash()
text(56, 62, "TRAINING SIGNAL", 11.8, NAVY, True)
text(202, 62, "Executed action a_t receives completed-match return R_t in {-1, +1}.",
     11.6, INK)
text(202, 42, "Minimize MSE(Q(o_t, a_t), R_t); no bootstrap target or hidden simulator cards.",
     11.6, MUTED)

c.showPage()
c.save()
print(OUT)
