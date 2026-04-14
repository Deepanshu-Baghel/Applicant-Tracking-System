# DNS Email Records: SPF and DMARC

These are DNS-level tasks and must be added in your DNS provider dashboard (Cloudflare, GoDaddy, Namecheap, etc.).

## SPF Record

Host/Name: @
Type: TXT
Value: v=spf1 mx a include:YOUR_MAIL_PROVIDER ~all
TTL: Auto (or 3600)

Replace YOUR_MAIL_PROVIDER with the include required by your mail service.
Examples:

- Google Workspace: include:\_spf.google.com
- Microsoft 365: include:spf.protection.outlook.com
- Resend: include:spf.resend.com

Important:

- Keep only one SPF TXT record on root domain.
- Merge includes into one SPF value if multiple providers are used.

## DMARC Record

Host/Name: \_dmarc
Type: TXT
Value: v=DMARC1; p=quarantine; adkim=s; aspf=s; pct=100; rua=mailto:dmarc@webresume.tech; fo=1
TTL: Auto (or 3600)

Progressive rollout suggestion:

1. Start with p=none for 7 days to monitor reports.
2. Move to p=quarantine once false positives are low.
3. Move to p=reject for full enforcement.

## Verification

Use these checks after DNS propagation:

- https://mxtoolbox.com/spf.aspx
- https://mxtoolbox.com/dmarc.aspx
- https://dmarcian.com/dmarc-inspector/
