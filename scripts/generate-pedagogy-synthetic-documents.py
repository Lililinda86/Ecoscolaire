"""Generate original, deterministic synthetic documents; no school/pupil data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader
import argparse
import hashlib
import json
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--poppler", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / "output/pdf/synthetic-ai"
preview = root / "tmp/pdfs/synthetic-ai"
fixtures = root / "tests/fixtures/synthetic-pedagogy-ai"
for directory in (out, preview, fixtures):
    directory.mkdir(parents=True, exist_ok=True)
lessons = [
    ("pre-fr", "Prematernelle - Français", "Trier deux couleurs",
     "Objectif : placer un grand objet rouge ou bleu dans le panier correspondant.",
     "Materiel : deux paniers et six grands objets sans risque d'ingestion.",
     "Etape 1 (3 min) : montrer un objet rouge et nommer sa couleur.",
     "Etape 2 (5 min) : inviter chaque enfant a trier avec aide si necessaire.",
     "Observation : noter le tri realise, sans attribuer de note chiffree."),
    ("nursery-en", "Nursery - English", "Listening to initial sounds",
     "Objective: hear the initial /m/ sound in familiar spoken words.",
     "Materials: picture cards of a moon, a mouse and a sun.",
     "Step 1 (4 min): say moon and mouse slowly; invite children to listen.",
     "Step 2 (6 min): ask children to select a picture beginning with /m/.",
     "Observation: record the spoken response, not a numerical mark."),
    ("primary-fr", "Primaire - Français", "Additionner jusqu'a dix",
     "Objectif : representer puis calculer 3 + 4 avec des jetons.",
     "Materiel : dix grands jetons et une feuille.",
     "Etape 1 (5 min) : former un groupe de trois et un groupe de quatre.",
     "Etape 2 (5 min) : reunir et compter les sept jetons.",
     "Verification : demander 2 + 5 ; reponse attendue : 7."),
    ("primary-en", "Primary - English", "Sharing into equal groups",
     "Objective: share twelve counters equally between three groups.",
     "Materials: twelve counters and three drawn circles.",
     "Step 1 (5 min): place one counter in each circle in turn.",
     "Step 2 (5 min): count four counters in each group.",
     "Check: twelve divided by three equals four."),
    ("college-en", "Lower secondary - English", "Equivalent fractions",
     "Objective: explain why one half equals two quarters.",
     "Materials: two identical paper rectangles and pencils.",
     "Step 1 (5 min): shade one of two equal parts in the first rectangle.",
     "Step 2 (5 min): shade two of four equal parts in the second rectangle.",
     "Check: multiplying numerator and denominator by two preserves value."),
]
manifest = []
for index, (slug, stage, title, *lines) in enumerate(lessons):
    pdf = out / (slug + ".pdf")
    c = canvas.Canvas(str(pdf), pagesize=A4, invariant=1, pageCompression=0)
    c.setTitle("Original synthetic preparation - " + slug)
    c.setAuthor("Synthetic test fixture")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(45, 790, "SYNTHETIC TEST ONLY - NOT AN OFFICIAL CURRICULUM")
    c.setFont("Helvetica", 12)
    c.drawString(45, 756, stage)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(45, 720, title)
    c.setFont("Helvetica", 11)
    for row, line in enumerate(lines):
        c.drawString(45, 675 - row * 42, line)
    c.setFont("Helvetica", 10)
    c.drawString(45, 105, "Original test content. No real school, pupil or teacher.")
    c.drawString(45, 85, "Draft only. No teaching confirmation or human approval implied.")
    c.drawString(45, 55, "Fixture " + str(index + 1) + " / 5 - Page 1 / 1")
    c.save()
    reader = PdfReader(pdf)
    assert len(reader.pages) == 1
    assert title in reader.pages[0].extract_text()
    target = preview / slug
    subprocess.run([args.poppler, "-f", "1", "-singlefile", "-scale-to", "1200", "-png", str(pdf), str(target)], check=True, capture_output=True)
    source = pdf if index < 3 else target.with_suffix(".png")
    destination = fixtures / (slug + source.suffix)
    shutil.copyfile(source, destination)
    manifest.append({"file": destination.name, "mimeType": "application/pdf" if index < 3 else "image/png", "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "size": destination.stat().st_size})
print(json.dumps(manifest))
