#!/bin/bash
# SocialSync startup script
cd /var/www/socialsync.aisetuppros.com
export NODE_ENV=production
export PORT=3457
exec npm start >> /tmp/socialsync.log 2>&1
