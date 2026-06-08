import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileCheck, FileText, Trash2 } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function JobDocsTab({ jobId, documents, customerId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["doc-templates"],
    queryFn: async () => {
      return db.DocumentTemplate.list("name");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.JobDocument.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-docs", jobId] });
      toast.success("Document removed");
    },
  });

  const createMutation = useMutation({
    mutationFn: (template) => db.JobDocument.create({
      job_id: jobId,
      template_id: template.id,
      template_name: template.name,
      customer_id: customerId,
      status: "in_progress",
      field_definitions: template.field_definitions,
      field_values: {},
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-docs", jobId] });
      setOpen(false);
      toast.success("Document attached");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1 text-xs h-8">
              <Plus className="w-3 h-3" /> Attach
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Attach Document</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No templates yet.{" "}
                  <Link to="/documents" className="text-primary underline underline-offset-2">Create one in Documents.</Link>
                </p>
              ) : templates.map(t => (
                <Card
                  key={t.id}
                  className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => createMutation.mutate(t)}
                >
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  <p className="text-xs text-primary mt-1">{t.field_definitions?.length || 0} fields</p>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {documents.length === 0 ? (
        <Card className="p-6 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No documents attached</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id}>
              <Link to={`/documents/fill/${doc.id}`}>
                <Card className="p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {doc.status === "completed"
                        ? <FileCheck className="w-4 h-4 text-green-600 shrink-0" />
                        : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.template_name}</p>
                        {doc.completed_date && (
                          <p className="text-xs text-muted-foreground">Completed {formatDateTime(doc.completed_date)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={doc.status} />
                      {doc.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.confirm("Remove this document from the job?")) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}