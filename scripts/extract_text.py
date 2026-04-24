import os
import sys
import json
import argparse
import docx

# Try to import PyMuPDF (fitz) for faster and better PDF extraction
try:
    import fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    try:
        import PyPDF2
        HAS_PYPDF2 = True
    except ImportError:
        HAS_PYPDF2 = False

def extract_text(file_path):
    if not os.path.exists(file_path):
        return f"ERRO: Arquivo não encontrado: {file_path}"
    
    ext = os.path.splitext(file_path)[1].lower()
    
    try:
        if ext == '.pdf':
            if HAS_PYMUPDF:
                # Use PyMuPDF (faster, better handling of tables/weird encodings)
                text = ""
                with fitz.open(file_path) as doc:
                    for page in doc:
                        text += page.get_text()
                return text
            elif HAS_PYPDF2:
                # Fallback to PyPDF2
                text = ""
                with open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        extracted = page.extract_text()
                        if extracted:
                            text += extracted + "\n"
                return text
            else:
                return "ERRO: Nenhuma biblioteca de PDF disponível (instale PyMuPDF ou PyPDF2)"
                
        elif ext == '.docx':
            doc = docx.Document(file_path)
            full_text = []
            for para in doc.paragraphs:
                full_text.append(para.text)
            return '\n'.join(full_text)
        
        else:
            return f"ERRO: Extensão não suportada: {ext}"
            
    except Exception as e:
        return f"ERRO ao extrair {ext}: {str(e)}"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', help='Caminho do arquivo')
    parser.add_argument('--dir', help='Diretório para processar em massa')
    args = parser.parse_args()

    results = []

    if args.file:
        text = extract_text(args.file)
        results.append({
            "file": os.path.basename(args.file),
            "text": text,
            "chars": len(text)
        })
    
    elif args.dir:
        for filename in os.listdir(args.dir):
            if filename.lower().endswith(('.pdf', '.docx')):
                path = os.path.join(args.dir, filename)
                text = extract_text(path)
                results.append({
                    "file": filename,
                    "text": text,
                    "chars": len(text)
                })
    
    # Retorna JSON para o Node.js
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
