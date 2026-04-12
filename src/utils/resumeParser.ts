type PdfJsModule = typeof import('pdfjs-dist');
type MammothModule = typeof import('mammoth');

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;
let mammothModulePromise: Promise<MammothModule> | null = null;

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist');
  }

  const pdfjsLib = await pdfjsModulePromise;
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  return pdfjsLib;
}

async function getMammoth(): Promise<MammothModule> {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth');
  }

  return mammothModulePromise;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'pdf') {
    return await extractTextFromPDF(file);
  } else if (extension === 'docx') {
    return await extractTextFromDOCX(file);
  } else {
    throw new Error('Unsupported file. Please upload a PDF or DOCX.');
  }
}

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  
  // pdfjs-dist requires a typed array
  const typedarray = new Uint8Array(arrayBuffer);
  const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
  
  let fullText = '';
  
  // Iterate through all pages to extract text
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((value) => value.length > 0);
    fullText += strings.join(' ') + '\n';
  }
  
  return fullText.trim();
}

async function extractTextFromDOCX(file: File): Promise<string> {
  const mammoth = await getMammoth();
  const arrayBuffer = await file.arrayBuffer();
  // mammoth extracts plain text from DOCX reliably
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}
