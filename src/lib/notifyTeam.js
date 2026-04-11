import { base44 } from "@/api/base44Client";

// Shared team notification sender
// Reads team emails from AppSettings and sends to all filled-in addresses
// All failures are silent — never block the user action
export async function notifyTeam({ subject, body, triggeredBy = "" }) {
  try {
    const allSettings = await base44.entities.AppSettings.list("key");
    const get = (key) => allSettings.find(s => s.key === key)?.value || "";

    const emails = [
      get("team_email_jeremy"),
      get("team_email_alex"),
      get("team_email_derek"),
      get("team_email_sean"),
    ].filter(e => e && e.includes("@"));

    if (emails.length === 0) return;

    const from_name = "AJ's Generator Service";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1e3a5f;padding:16px 20px;border-radius:8px 8px 0 0;">
          <p style="color:white;margin:0;font-size:16px;font-weight:bold;">AJ's Generator Service</p>
          <p style="color:#a8c4e0;margin:2px 0 0 0;font-size:11px;">Internal Team Notification</p>
        </div>
        <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px;">
          ${body}
          ${triggeredBy ? `<p style="font-size:11px;color:#aaa;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">Action performed by: ${triggeredBy}</p>` : ""}
        </div>
      </div>
    `;

    for (const email of emails) {
      try {
        await base44.integrations.Core.SendEmail({ to: email, from_name, subject, html });
      } catch {
        // silently fail per address
      }
    }
  } catch {
    // silently fail entirely — never block the user action
  }
}

export function buildRow(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:5px 0;font-size:12px;color:#666;width:110px;vertical-align:top;">${label}</td><td style="padding:5px 0;font-size:12px;color:#1a1a1a;font-weight:600;">${value}</td></tr>`;
}

export function buildTable(rows) {
  const filteredRows = rows.filter(Boolean).join("");
  if (!filteredRows) return "";
  return `<table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0;"><tbody style="padding:12px;display:block;">${filteredRows}</tbody></table>`;
}

export function buildEventBadge(label, color) {
  const colors = {
    green: "background:#dcfce7;color:#166534;",
    blue: "background:#dbeafe;color:#1d4ed8;",
    amber: "background:#fef3c7;color:#92400e;",
    red: "background:#fee2e2;color:#991b1b;",
    purple: "background:#f3e8ff;color:#6b21a8;",
  };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;${colors[color] || colors.blue}">${label}</span>`;
}