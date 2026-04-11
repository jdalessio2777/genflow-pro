import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getUserColor, getUserDisplayName } from "@/lib/userColors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/layout/PageHeader";
import { Send, Trash2, StickyNote } from "lucide-react";
import { formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";

export default function TeamNotes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { data: notes = [] } = useQuery({
    queryKey: ["team-notes"],
    queryFn: () => base44.entities.TeamNote.list("-created_date", 50),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TeamNote.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-notes"] });
      setText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TeamNote.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-notes"] }),
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    createMutation.mutate({
      text: text.trim(),
      author_email: user?.email || "",
      author_name: getUserDisplayName(user),
    });
  };

  const userColor = getUserColor(user?.email, getUserDisplayName(user));

  return (
    <div>
      <PageHeader title="Team Notes" subtitle="Shared notepad" back="/" />
      <div className="px-4 pt-3 pb-4 space-y-3 max-w-lg mx-auto">

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-6 h-6 rounded-full ${userColor.dot} flex items-center justify-center`}>
              <span className="text-[9px] font-bold text-white">
                {getUserDisplayName(user).slice(0, 1).toUpperCase()}
              </span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{getUserDisplayName(user)}</span>
          </div>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Leave a note for the team..."
            className="rounded-xl text-sm resize-none"
            rows={2}
          />
          <Button
            className="w-full rounded-xl mt-2 gap-1.5 h-9 text-sm"
            onClick={handleSubmit}
            disabled={!text.trim() || createMutation.isPending}
          >
            <Send className="w-3.5 h-3.5" /> Post Note
          </Button>
        </Card>

        {notes.length === 0 ? (
          <Card className="p-8 text-center">
            <StickyNote className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notes yet</p>
            <p className="text-xs text-muted-foreground mt-1">Leave notes for the team here</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {notes.map(note => {
              const color = getUserColor(note.author_email, note.author_name);
              const isMe = note.author_email === user?.email;
              return (
                <Card key={note.id} className={`p-3 border ${color.border} ${color.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div className={`w-6 h-6 rounded-full ${color.dot} flex items-center justify-center shrink-0 mt-0.5`}>
                        <span className="text-[9px] font-bold text-white">
                          {(note.author_name || "?").slice(0, 1).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold ${color.text}`}>{note.author_name}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(note.created_date)}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{note.text}</p>
                      </div>
                    </div>
                    {isMe && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => { if (window.confirm("Delete this note?")) deleteMutation.mutate(note.id); }}>
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}