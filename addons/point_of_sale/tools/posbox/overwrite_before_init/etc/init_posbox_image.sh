#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail
# set -o xtrace

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__file="${__dir}/$(basename "${BASH_SOURCE[0]}")"
__base="$(basename ${__file} .sh)"

# Recommends: antiword, graphviz, ghostscript, python-gevent, poppler-utils
export DEBIAN_FRONTEND=noninteractive

# set locale to en_US
echo "set locale to en_US"
echo "en_US.UTF-8 UTF-8" > /etc/locale.gen
locale-gen
# Environment variables
echo "export LANGUAGE=en_US.UTF-8" >> ~/.bashrc
echo "export LANG=en_US.UTF-8" >> ~/.bashrc
echo "export LC_ALL=en_US.UTF-8" >> ~/.bashrc
echo "export DISPLAY=:0" | tee -a ~/.bashrc /home/pi/.bashrc
echo "export XAUTHORITY=/run/lightdm/pi/xauthority" >> /home/pi/.bashrc
echo "export XAUTHORITY=/run/lightdm/root/:0" >> ~/.bashrc
# Aliases
echo  "alias ll='ls -al'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias odoo='sudo systemctl restart odoo; /usr/bin/python3 /home/pi/odoo/odoo-bin --config /home/pi/odoo/addons/point_of_sale/tools/posbox/configuration/odoo.conf --load=hw_drivers,hw_escpos,hw_posbox_homepage,point_of_sale,web'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias odoo_logs='less +F /var/log/odoo/odoo-server.log'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias write_mode='sudo mount -o remount,rw / && sudo mount -o remount,rw /root_bypass_ramdisks'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias read_mode='sudo mount -o remount,ro / && sudo mount -o remount,ro /root_bypass_ramdisks'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias install='sudo mount -o remount,rw / && sudo mount -o remount,rw /root_bypass_ramdisks; sudo chroot /root_bypass_ramdisks/; sudo mount -t proc proc /proc'" | tee -a ~/.bashrc /home/pi/.bashrc
echo  "alias blackbox='ls /dev/serial/by-path/'" | tee -a ~/.bashrc /home/pi/.bashrc
echo "
show_odoo_aliases() {
  echo 'Welcome to Odoo IoTBox tools'
  echo 'odoo                Starts/Restarts Odoo server'
  echo 'odoo_logs           Displays Odoo server logs in real time'
  echo 'write_mode          Enables system write mode'
  echo 'read_mode           Switches system to read-only mode'
  echo 'install             Bypasses ramdisks to allow package installation'
  echo 'blackbox            Lists all serial connected devices'
}
alias odoo_help='show_odoo_aliases'
" | tee -a ~/.bashrc /home/pi/.bashrc

source ~/.bashrc
source /home/pi/.bashrc

apt-get update

# At the first start it is necessary to configure a password
# This will be modified by a unique password on the first start of Odoo
password="$(openssl rand -base64 12)"
echo "pi:${password}" | chpasswd

PKGS_TO_INSTALL="
    chromium-browser \
    console-data \
    cups \
    cups-ipp-utils \
    dbus \
    dbus-x11 \
    dnsmasq \
    fswebcam \
    git \
    hostapd \
    iw \
    kpartx \
    libcups2-dev \
    libpq-dev \
    lightdm \
    localepurge \
    nginx-full \
    openbox \
    printer-driver-all \
    python3 \
    python3-cups \
    python3-babel \
    python3-dateutil \
    python3-dbus \
    python3-decorator \
    python3-dev \
    python3-docutils \
    python3-geoip2 \
    python3-jinja2 \
    python3-ldap \
    python3-libsass \
    python3-lxml \
    python3-mako \
    python3-mock \
    python3-netifaces \
    python3-passlib \
    python3-pil \
    python3-pip \
    python3-psutil \
    python3-psycopg2 \
    python3-pydot \
    python3-qrcode \
    python3-reportlab \
    python3-requests \
    python3-serial \
    python3-stdnum \
    python3-tz \
    rsync \
    screen \
    swig \
    unclutter \
    vim \
    x11-utils \
    xdotool \
    xserver-xorg-input-evdev \
    xserver-xorg-video-dummy \
    xserver-xorg-video-fbdev"

echo "Acquire::Retries "16";" > /etc/apt/apt.conf.d/99acquire-retries
# KEEP OWN CONFIG FILES DURING PACKAGE CONFIGURATION
# http://serverfault.com/questions/259226/automatically-keep-current-version-of-config-files-when-apt-get-install
apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" install ${PKGS_TO_INSTALL}
apt-get -y autoremove

apt-get clean
localepurge
rm -rfv /usr/share/doc

# python-usb in wheezy is too old
# the latest pyusb from pip does not work either, usb.core.find() never returns
# this may be fixed with libusb>2:1.0.11-1, but that's the most recent one in raspios
# so we install the latest pyusb that works with this libusb.
# Even in stretch, we had an error with langid (but worked otherwise)
# We fixe the version of evdev to 1.2.0 because in 1.3.0 we have a RuntimeError in 'get_event_loop()'
PIP_TO_INSTALL="
    evdev==1.6.0 \
    gatt \
    polib \
    pycups \
    pyusb \
    v4l2 \
    pysmb==1.2.9.1 \
    cryptocode==0.1 \
    PyKCS11 \
    RPi.GPIO \
    rjsmin==1.1.0 \
    websocket-client==1.6.3 \
    PyPDF2==1.26.0 \
    Werkzeug==2.0.2 \
    urllib3==1.26.5 \
    pyOpenssl==22.0.0 \
    screeninfo \
    cryptography==36.0.2 \
    vcgencmd \
    zeep \
    num2words"

pip3 install ${PIP_TO_INSTALL} --break-system-package

# Dowload MPD server and library for Six terminals
wget 'https://nightly.odoo.com/master/iotbox/eftdvs' -P /usr/local/bin/
chmod +x /usr/local/bin/eftdvs
wget 'https://nightly.odoo.com/master/iotbox/eftapi.so' -P /usr/lib/

groupadd usbusers
usermod -a -G usbusers pi
usermod -a -G lp pi
usermod -a -G input lightdm
mkdir -v /var/log/odoo
chown pi:pi /var/log/odoo
chown pi:pi -R /home/pi/odoo/

# logrotate is very picky when it comes to file permissions
chown -R root:root /etc/logrotate.d/
chmod -R 644 /etc/logrotate.d/
chown root:root /etc/logrotate.conf
chmod 644 /etc/logrotate.conf

echo "* * * * * rm /var/run/odoo/sessions/*" | crontab -

update-rc.d -f hostapd remove
update-rc.d -f nginx remove
update-rc.d -f dnsmasq remove

systemctl enable ramdisks.service
systemctl enable led-status.service
systemctl disable dphys-swapfile.service
systemctl enable ssh
systemctl set-default graphical.target
systemctl disable getty@tty1.service
systemctl enable systemd-timesyncd.service
systemctl unmask hostapd.service
systemctl disable hostapd.service
systemctl disable cups-browsed.service
systemctl enable odoo.service

# disable overscan in /boot/config.txt, we can't use
# overwrite_after_init because it's on a different device
# (/dev/mmcblk0p1) and we don't mount that afterwards.
# This option disables any black strips around the screen
# cf: https://www.raspberrypi.org/documentation/configuration/raspi-config.md
echo "disable_overscan=1" >> /boot/config.txt

# Use the fkms driver instead of the legacy one (RPI3 requires this)
sed -i '/dtoverlay/c\dtoverlay=vc4-fkms-v3d' /boot/config.txt

# exclude /drivers folder from git info to be able to load specific drivers
echo "addons/hw_drivers/iot_devices/" > /home/pi/odoo/.git/info/exclude

# create dirs for ramdisks
create_ramdisk_dir () {
    mkdir -v "${1}_ram"
}

create_ramdisk_dir "/var"
create_ramdisk_dir "/etc"
create_ramdisk_dir "/tmp"
mkdir -v /root_bypass_ramdisks

echo "password"
echo ${password}
