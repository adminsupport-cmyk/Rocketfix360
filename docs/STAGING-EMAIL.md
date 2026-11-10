# Confirmation email setup for staging

Customer confirmations already have a separate Firebase outbox event. Payment confirmation does not wait for email, and updating a payment does not create another email event. External email remains disabled until a verified sender and a controlled test inbox are ready.

1. Verify the sending address or domain with your SMTP provider. Use port 465 (TLS) or 587 (STARTTLS).
2. In the Google Cloud Secret Manager console for **rocketfix-360-staging**, configure `RF_SMTP_HOST`, `RF_SMTP_PORT`, `RF_SMTP_USER`, `RF_SMTP_PASS`, and `RF_SMTP_FROM`. Enter values there, never in chat or source control.
3. Confirm the test recipient separately. The first rollout must keep the provider allowlist limited to that inbox and stamp a new activation cutoff. Verify a new outbox event, one provider acceptance and no repeat on refresh or edit before authorizing customer delivery.

Do not manually requeue earlier simulated emails as part of activation.
