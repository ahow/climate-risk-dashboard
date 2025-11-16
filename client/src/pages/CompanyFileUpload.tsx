import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

export default function CompanyFileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{
    success: boolean;
    fileUrl: string;
    companiesProcessed: number;
    assetsCreated: number;
    risksCalculated: number;
    managementAssessments: number;
  } | null>(null);

  const processFileMutation = trpc.files.processCompanyFile.useMutation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      const validExtensions = ['.csv', '.xlsx', '.xls'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        toast.error("Please select a CSV or Excel file");
        return;
      }
      
      setSelectedFile(file);
      setProcessResult(null);
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }

    setProcessing(true);
    setProcessResult(null);
    
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          const base64Content = base64Data.split(',')[1]; // Remove data:mime;base64, prefix

          toast.info("Processing file... This may take several minutes.");
          
          const result = await processFileMutation.mutateAsync({
            filename: selectedFile.name,
            fileType: selectedFile.type || 'application/octet-stream',
            fileSize: selectedFile.size,
            base64Data: base64Content,
            description: description || undefined,
          });

          setProcessResult(result);
          toast.success("File processed successfully!");
          setSelectedFile(null);
          setDescription("");
        } catch (error) {
          toast.error("Failed to process file: " + (error instanceof Error ? error.message : 'Unknown error'));
          console.error(error);
        } finally {
          setProcessing(false);
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setProcessing(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      toast.error("Failed to process file");
      console.error(error);
      setProcessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950 py-12 px-4">
      <div className="container max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Company Data Upload
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Upload company data (CSV or Excel) to automatically assess climate risks
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Upload Company File
            </CardTitle>
            <CardDescription>
              Upload a CSV or Excel file with company data (ISIN, Name, Assets, EV). 
              The system will automatically fetch assets, calculate geographic risks, and assess risk management.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file">File (CSV or Excel)</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept=".csv,.xlsx,.xls"
                className="cursor-pointer"
                disabled={processing}
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
                placeholder="Add a description for this upload..."
                rows={3}
                disabled={processing}
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Processing Time</AlertTitle>
              <AlertDescription>
                Processing may take 5-10 minutes depending on the number of companies. 
                The system will fetch assets, calculate geographic risks, and assess risk management for each company.
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleProcess}
              disabled={!selectedFile || processing}
              className="w-full"
              size="lg"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing... Please wait
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Process File
                </>
              )}
            </Button>

            {processing && (
              <div className="space-y-2">
                <Progress value={undefined} className="w-full" />
                <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                  Processing companies and calculating risks...
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {processResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                Processing Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {processResult.companiesProcessed}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Companies Processed
                  </div>
                </div>
                
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {processResult.assetsCreated}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Assets Discovered
                  </div>
                </div>
                
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {processResult.risksCalculated}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Risks Calculated
                  </div>
                </div>
                
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {processResult.managementAssessments}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Management Assessments
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm text-slate-600 dark:text-slate-400">
                  Permanent Public URL (accessible from any application):
                </Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={processResult.fileUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(processResult.fileUrl);
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
                    <a href={processResult.fileUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  This URL can be shared with other applications and will remain accessible permanently.
                </p>
              </div>

              <Button
                onClick={() => window.location.href = '/'}
                className="w-full"
                variant="default"
              >
                View Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

