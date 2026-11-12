# 27h Email form widget (port of the legacy emailForm)

**Status (2026-11-12):** agreed with Artem and implemented in both repos, not committed, no browser check.
Server test `heurist/tests/EmailFormTest.php` (38 pass), JS `shared/test/hEmailForm.test.js`; the endpoint was checked
with curl (question, wrong answer 403, right answer, other site 403). No message was really sent (§6).

## 1. Legacy

`hclient/widgets/admin/emailForm.js/.html` (jQuery widget `heurist_emailForm`): name, email, message, captcha
"a + b + 1 =" (`hserv/utilities/captcha.php`, answer in the session key `captcha_code`), inline or popup button. It
posts to `sysBugreport` save → `DbSysBugreport::_prepareEmail`: captcha used once (`CaptchaService::consumeCaptcha`),
recipient = DT_EMAIL of the website record, else the database owner (user 2), `sendPHPMailer` (PHP mail()).

## 2. Decisions (Artem, 2026-11-12)

1. A widget of CMS v4 whose HTML is written by the server (like cards, menu, badges); not a JavaScript module. A small
   activation in the site runtime asks for the captcha question and sends the message.
2. Endpoint in the special `/external` section (plan 28): `GET /api/{db}/external/email` → `{question}`;
   `POST /api/{db}/external/email` `{site, name, email, message, captcha, url}` → `{sent: true}`.
3. Mail: an **SMTP relay** when `$mailSmtp` is configured in heuristConfigIni.php, otherwise the legacy mailer.
4. Captcha: **in the session, as legacy** (same key `captcha_code`, used once).

## 3. Server (heurist repo)

- `srv/ExternalService/EmailForm/EmailFormService.php`: `question()`, `send()`. Field checks first (name one line ≤ 100,
  email, message 1..5000; 400 keeps the answer), then the captcha (403, the answer is gone), at most 5 messages per
  session and hour (429), recipient (404 not a website or page), send (502 with the reason). Subject
  `Website "<title as text>": message from <name>`; body = escaped message with line breaks, sender and page URL;
  **Reply-To = the visitor**, From = the server address (SPF).
- `EmailFormSession` (captcha answer, sent times) and `EmailFormRecipients` interfaces; the session is an anonymous
  class in `ServiceFactory::fromLegacySystem` over the legacy `SessionStore` (srv does not use hserv itself).
- `srv/Website/WebsiteContact.php`: a website (RT_CMS_HOME) or a standalone page (RT_CMS_PAGE): DT_EMAIL values (split
  by `;`), else the database owner (`UserGroupRepository`, user 2).
- `srv/ExternalService/Mail/`: `MailMessage`, `MailTransport`, `SmtpMailTransport` (PHPMailer SMTP),
  `CallbackMailTransport` (the legacy mailer closure of ServiceFactory), `MailService::transport()` chooses. Reusable
  for other e-mails of srv later (reminders).
- `$mailSmtp = ['host','port','user','password','secure' => tls|ssl|'','from','fromName']`, documented in
  `movetoparent/heuristConfigIni.php`. `sendPHPMailer` got two optional parameters `$replyTo`, `$replyToName`.
- `ExternalServiceController`: service `email` (GET, POST), `Cache-Control: no-store`; `SameSiteGuard::assertSameSite`
  (the Origin check without the login; `assert` = login + assertSameSite). `hserv/controller/api.php`: GET allowed and
  guests allowed for `external/email` only (translate stays POST and logged in).
- Widget `email`: `CmsValidator` widget list; `PageContent::widget` → `EmailFormHtml::render` (form with labelled
  inputs, the question placeholder, Send, status line, noscript line; display `button` = a button and a `<dialog>`);
  words in English and French in the class. No captcha in the HTML (pages can be cached).

## 4. Client (this repo)

- `shared/src/widgets/site/HEmailForm.js` + `.css`: activates the server form or writes the same markup for an empty
  host (designer draft, `emailFormHtml`); asks the question on the first focus (or when the popup opens), checks the
  fields, posts, shows the result; a new question after an error (not after 429); in the designer nothing is sent.
- `apps/website/src/siteRuntime.js` mounts it (`runtime.apiBaseUrl`, the site or page id).
- Designer: *Email form* available in Add element (`designerCatalog.js`); `cmsEdit.js` element `email` (widget host
  without the kind min-height); `widgetForms.js` `openEmailForm`: Display (Form on the page / Button that opens the
  form in a popup), Button caption with translations (`label`, `labels`), help about the recipient.
- Settings: `{}` (inline) or `{display: 'button', label?, labels?}`.

## 5. Limits

- Works on pages served by this Heurist server (session cookie, same-site check). A built ZIP website hosted
  elsewhere shows the form, but sending is refused.
- The *Contact* page preset (Add page, pending) is a later step.

## 6. Still to check

- A real message: without `$mailSmtp` (PHP mail()) and with an SMTP relay (e.g. a local Mailpit on port 1025),
  Reply-To = the visitor.
- Browser: inline and button display, a French page, the designer preview.
