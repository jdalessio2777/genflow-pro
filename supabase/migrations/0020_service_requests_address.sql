-- Add a structured address column to service_requests. Existing leads keep
-- address (if any) embedded in their free-text message; this only affects
-- new submissions going forward, once the website's contact form starts
-- sending it (genshield-website/index.html, "address" field).
alter table service_requests add column address text;
