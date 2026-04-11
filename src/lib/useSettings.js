import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const SETTING_DEFAULTS = {
  home_address: "31209 Courtnay Lane, Wharton NJ 07885",
  business_name: "AJ's Generator Service",
  business_phone: "",
  business_email: "",
  first_half_hour_rate: "125",
  hourly_rate: "115",
  google_maps_api_key: "",
  // Team notification emails
  team_email_jeremy: "",
  team_email_alex: "",
  team_email_derek: "",
  team_email_sean: "",
};

export function useSettings() {
  const queryClient = useQueryClient();

  const { data: rawSettings = [], isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.list("key"),
  });

  const settings = { ...SETTING_DEFAULTS };
  rawSettings.forEach(s => {
    if (s.key && s.value !== undefined && s.value !== null) {
      settings[s.key] = s.value;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const existing = rawSettings.find(s => s.key === key);
      if (existing) {
        return base44.entities.AppSettings.update(existing.id, { value: String(value) });
      } else {
        return base44.entities.AppSettings.create({ key, value: String(value) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });

  const setSetting = (key, value) => {
    updateMutation.mutate({ key, value });
  };

  return { settings, isLoading, setSetting, isSaving: updateMutation.isPending };
}