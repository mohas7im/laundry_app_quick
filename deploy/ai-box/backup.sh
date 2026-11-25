#!/bin/bash
R=/srv/crown-ai/data/hashim-pilot
docker exec hq-db pg_dump -U hq -d laundry -Fc > $R/backups/laundry-$(date +%F-%H%M).dump && chmod 600 $R/backups/*.dump
find $R/backups -name '*.dump' -mtime +30 -exec mv {} /tmp/ \;
