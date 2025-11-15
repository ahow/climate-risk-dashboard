import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileText, ExternalLink, Loader2 } from "lucide-react";

export default function FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const uploadMutation = trpc.files.upload.useMutation();
  const { data: uploadedFiles, refetch } = trpc.files.list.useQuery();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        const base64Content = base64Data.split(',')[1]; // Remove data:mime;base64, prefix

        await uploadMutation.mutateAsync({
          filename: selectedFile.name,
          fileType: selectedFile.type || 'application/octet-stream',
          fileSize: selectedFile.size,
          base64Data: base64Content,
          description: description || undefined,
        });

        toast.success("File uploaded successfully!");
        setSelectedFile(null);
        setDescription("");
        refetch();
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      toast.error("Failed to upload file");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: Date) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950 py-12 px-4">
      <div className="container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            File Upload
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Upload CSV files and other documents with permanent public URLs
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload New File
            </CardTitle>
            <CardDescription>
              Select a file to upload. Files are stored securely in S3 with permanent public URLs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept=".csv,.xlsx,.xls,.pdf,.doc,.docx"
                className="cursor-pointer"
              />
              {selectedFile && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for this file..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Uploaded Files List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Uploaded Files
            </CardTitle>
            <CardDescription>
              All uploaded files with permanent public URLs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!uploadedFiles || uploadedFiles.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                No files uploaded yet
              </p>
            ) : (
              <div className="space-y-4">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                          {file.filename}
                        </h3>
                        {file.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {file.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
                          <span>Size: {formatFileSize(file.fileSize)}</span>
                          <span>Type: {file.fileType}</span>
                          <span>Uploaded: {formatDate(file.uploadedAt)}</span>
                        </div>
                        <div className="mt-3">
                          <Label className="text-xs text-slate-500 dark:text-slate-400">
                            Permanent URL:
                          </Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              value={file.s3Url}
                              readOnly
                              className="font-mono text-xs"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(file.s3Url);
                                toast.success("URL copied to clipboard!");
                              }}
                            >
                              Copy
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a href={file.s3Url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

