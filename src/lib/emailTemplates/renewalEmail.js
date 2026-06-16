export function renewalEmailSubject() {
  return "Your GenShield Generator Service is Due";
}

export function renewalEmailHTML({ customerName, plan, expiryDate }) {
  const formattedDate = new Date(expiryDate).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">

        <!-- HEADER -->
        <tr>
          <td style="background:#1a1a1c;padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              Gen<span style="color:#D32C2C;">Shield</span>
            </p>
            <p style="margin:5px 0 0;color:#666666;font-size:10px;letter-spacing:2px;">
              STANDBY GENERATOR SERVICE &amp; REPAIR
            </p>
          </td>
        </tr>

        <!-- RED BAR -->
        <tr>
          <td style="background:#D32C2C;height:3px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px;">

            <!-- GREETING -->
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1c;">
              Hi ${customerName},
            </p>

            <!-- PARAGRAPH 1 -->
            <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.7;">
              Your generator maintenance agreement is coming up for renewal. Regular service is the difference between a generator that starts and one that doesn't.
            </p>

            <!-- EXPIRY BOX -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
              <tr>
                <td style="background:#f9f9f9;border:1px solid #e0e0e0;border-left:3px solid #D32C2C;border-radius:6px;padding:14px 16px;">
                  <p style="margin:0 0 3px;font-size:13px;color:#888888;">
                    ${plan} Maintenance Agreement
                  </p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1c;">
                    Expires ${formattedDate}
                  </p>
                </td>
              </tr>
            </table>

            <!-- PARAGRAPH 2 -->
            <p style="margin:0 0 12px;font-size:14px;color:#555555;line-height:1.7;">
              Schedule your service visit and we'll take care of everything — oil change, filters, spark plugs, battery check, full system test, and a written report.
            </p>

            <!-- CTA BUTTON -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 20px;">
              <tr>
                <td align="center">
                  <a href="https://genshieldservice.com/#contact"
                     style="display:inline-block;background:#D32C2C;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:6px;text-decoration:none;letter-spacing:0.3px;">
                    Schedule My Service &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- OR CALL -->
            <p style="text-align:center;font-size:13px;color:#888888;margin:0 0 24px;">
              Or call us directly &mdash; <strong style="color:#1a1a1c;">973-787-2431</strong>
            </p>

            <!-- DIVIDER -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="border-top:1px solid #e0e0e0;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- CLOSING -->
            <p style="margin:0 0 20px;font-size:13px;color:#888888;line-height:1.65;">
              We'll reach out to confirm timing once we receive your request. As always, we work around your schedule.
            </p>

            <!-- SIGNATURE -->
            <p style="margin:0 0 4px;font-size:14px;color:#1a1a1c;">
              &mdash; Jeremy &amp; Alex
            </p>
            <p style="margin:0;font-size:12px;color:#888888;">
              GenShield Generator Service &amp; Repair
            </p>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:11px;color:#888888;line-height:1.6;">
              973-787-2431 &nbsp;&middot;&nbsp; genshieldservice.com &nbsp;&middot;&nbsp; Northern &amp; Central NJ
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#D32C2C;font-style:italic;">
              Power When It Matters Most
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
