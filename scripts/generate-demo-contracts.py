"""Generate fictional demo attachments: uv run --with reportlab scripts/generate-demo-contracts.py"""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

root = Path(__file__).resolve().parents[1]
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ContractTitle", fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=colors.HexColor("#233c2b"), spaceAfter=16))
styles.add(ParagraphStyle(name="ContractBody", fontName="Helvetica", fontSize=11, leading=16, spaceAfter=12))
styles.add(ParagraphStyle(name="ContractKicker", fontName="Helvetica-Bold", fontSize=10, leading=15, textColor=colors.HexColor("#5b734b"), spaceAfter=12))
styles.add(ParagraphStyle(name="ContractFooter", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#556052")))
for kind, title, location, dates, amount, inventory in [
    ("apartment", "Apartment deposit agreement", "Fictional unit DEMO-18, Budapest", "1-17 October 2026", "EUR 1,000", "Both keys and the apartment inventory"),
    ("equipment", "Camera deposit agreement", "Fictional camera handover desk, Budapest", "16-17 October 2026", "EUR 300", "Camera DEMO-CAM-001, battery and case"),
]:
    path = root / "public" / "demo-contracts" / f"demo-{kind}-contract.pdf"
    story = [Paragraph("PACT / DEMO SAMPLE / VERSION 1", styles["ContractKicker"]), Paragraph(title, styles["ContractTitle"]), Paragraph("Fictional document for a hackathon demonstration. This is not a signed rental contract or a regulated escrow arrangement.", styles["ContractBody"])]
    rows = [("Landlord / owner", "Maya Petrova - demo identity"), ("Tenant / renter", "Luca Martin - demo identity"), ("Location", location), ("Rental dates", dates), ("Refundable deposit", amount), ("Included", inventory)]
    table = Table([[Paragraph(a, styles["ContractBody"]), Paragraph(b, styles["ContractBody"])] for a,b in rows], colWidths=[135, 345], hAlign="LEFT")
    table.setStyle(TableStyle([("BACKGROUND", (0,0),(-1,-1),colors.HexColor("#f1f5ec")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
    story.extend([table, Spacer(1,24)])
    for heading, body in [
        ("1. Agreement and condition", "The landlord creates the terms and attaches this contract. The tenant accepts the agreement version. The landlord then publishes photographs and a starting-condition checklist. The tenant reviews and acknowledges that exact condition version before funding the full simulated deposit."),
        ("2. Return and deposit review", "Return the listed property in the acknowledged condition. The first photographed return declaration starts a 48-hour review using the demo device clock. The landlord can approve a full refund or propose a reasoned deduction. A split requires the tenant's explicit approval of the current proposal."),
        ("3. Demonstration limits", "All funding, balances, allocations and refunds are simulated. No real money is held or transferred, no live Wise integration is connected, and automatic refunds are not implemented in this demo. Condition records and uploaded PDFs remain in this browser."),
    ]:
        story.extend([Paragraph(heading, styles["Heading3"]), Paragraph(body, styles["ContractBody"])])
    story.append(Spacer(1,12))
    story.append(Paragraph("Sample only. Replace this PDF when entering different contract terms. Acceptance in the role-switching demo is not identity verification or a legal signature.",styles["ContractFooter"]))
    SimpleDocTemplate(str(path), pagesize=(595.28,841.89), leftMargin=54, rightMargin=54, topMargin=48, bottomMargin=42, title=f"Pact - {title} - Demo sample", author="Pact hackathon demo").build(story)
    print(path)
