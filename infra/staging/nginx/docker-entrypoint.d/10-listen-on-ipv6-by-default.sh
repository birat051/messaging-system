#!/bin/sh
# Replaces the stock **`10-listen-on-ipv6-by-default.sh`** from **`nginx:alpine`**. Our **`default.conf`**
# is bind-mounted **`:ro`**, so the upstream script cannot apply its IPv6 listen patch anyway; staging is IPv4-only.
exit 0
