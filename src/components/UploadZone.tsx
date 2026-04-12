"use client";

import { useState, useRef } from "react";
import { UploadCloud, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

export default function UploadZone({ 
  onFileSelect, 
  onClear 
}: { 
  onFileSelect: (file: File) => void,
  onClear: () => void 
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    if (e.dataTransfer.files?.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.type === "application/pdf" || file.name.endsWith(".docx")) {
      setSelectedFile(file);
      onFileSelect(file);
    } else {
      alert("Please upload a valid PDF or DOCX file.");
    }
  };

  return (
    <div 
      className={clsx(
        "relative rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300",
        isHovering ? "border-primary-500 bg-primary-500/10" : "border-border bg-card hover:border-primary-400 hover:bg-card/80",
        selectedFile && "border-green-500 bg-green-500/5 shadow-inner"
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsHovering(false)}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        accept=".pdf,.docx" 
        className="hidden" 
        ref={inputRef} 
        onChange={(e) => e.target.files?.length && handleFile(e.target.files[0])} 
      />
      
      {!selectedFile ? (
        <div className="flex flex-col items-center justify-center cursor-pointer" onClick={() => inputRef.current?.click()}>
          <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mb-4 text-primary-500">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium mb-1">Click to upload or drag and drop</h3>
          <p className="text-sm text-muted">PDF or DOCX (max 5MB)</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4 text-green-500">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">{selectedFile.name}</h3>
          <button 
            onClick={() => { setSelectedFile(null); onClear(); }}
            className="mt-2 text-sm font-medium px-4 py-2 rounded-lg bg-background border border-border hover:bg-muted/10 transition-colors"
          >
            Remove file
          </button>
        </div>
      )}
    </div>
  );
}
