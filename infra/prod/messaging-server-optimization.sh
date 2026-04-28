#!/bin/bash
cat >> /etc/sysctl.conf << 'EOF'
fs.file-max = 1000000
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
vm.swappiness = 10
EOF

sysctl -p

cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 1000000
* hard nofile 1000000
EOF