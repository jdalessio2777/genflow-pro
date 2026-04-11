import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Copy } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "sonner";

export default function Documents() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["doc-templates"],
    queryFn: () => db.DocumentTemplate.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.DocumentTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success("Template deleted");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template) => {
      const { id, created_date, updated_date, created_by, ...data } = template;
      await db.DocumentTemplate.create({ ...data, name: `${data.name} (Copy)` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success("Template duplicated");
    },
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={`${templates.length} templates`}
        actions={
          <Link to="/documents/new">
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> New</Button>
          </Link>
        }
      />

      <div className="p-4 space-y-3">
        {templates.length === 0 && !isLoading ? (
          <EmptyState
            icon={FileText}
            title="No templates"
            description="Create checklists, inspection forms, and more"
            action={
              <Link to="/documents/new">
                <Button className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Create Template</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <Card key={t.id} className="p-3">
                <div className="flex items-start justify-between">
                  <Link to={`/documents/${t.id}/edit`} className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    <p className="text-xs text-primary mt-1">{t.fields?.length || 0} fields · {t.category || "general"}</p>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateMutation.mutate(t)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(t.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}