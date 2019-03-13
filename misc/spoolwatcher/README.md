# Purpose
Watch spool directory then spawn PHP process to send email.

# Install
```
# Install nodejs depedencies
npm install
# Install php depedencies
composer install
```

# Overview
Nodejs process will watch spool directory for new file.
Each new file will create new php process.
Spool directory basically is a serialized Swiftmailer_Message class. PHP process will unserialize it and send with SES credential, using SES API transport.
Note: We are using SES API, not SES SMTP.

Inside index.js, there are 2 limit you can set:
- Sending rate (per second), to adapt with your SES sending rate.
- Concurrency of PHP processs, to control CPU/memory of your host

** 

** Please create Pull Request to improve these tools.

# Environment Variable
- SPOOL_DIR
- AWS_ACCESSKEY
- AWS_SECRETKEY
