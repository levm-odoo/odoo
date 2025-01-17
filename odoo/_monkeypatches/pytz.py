# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""
In ubuntu noble, some timezone where removed leading to errors when trying to assign/access them.

This was partially fixed in the code by removing all references to old timezones but one issue remains:
if a database contains timezones that are not defined in the os, the resolution will fail and break
at runtime.

This patches proposes to alter timezone to fallback on the new canonical timezone if the timezone was removed.

This list was generated by checking all symlink in /usr/share/zoneinfo in ubuntu 22.04 that disapeared in ubuntu 24.04

This solutions will work when moving a database from one server to another, even without migration.
This list could be improved for other purposes.

"""

import pytz

from odoo._monkeypatches import register


_tz_mapping = {
    "Africa/Asmera": "Africa/Nairobi",
    "America/Argentina/ComodRivadavia": "America/Argentina/Catamarca",
    "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "America/Cordoba": "America/Argentina/Cordoba",
    "America/Fort_Wayne": "America/Indiana/Indianapolis",
    "America/Indianapolis": "America/Indiana/Indianapolis",
    "America/Jujuy": "America/Argentina/Jujuy",
    "America/Knox_IN": "America/Indiana/Knox",
    "America/Louisville": "America/Kentucky/Louisville",
    "America/Mendoza": "America/Argentina/Mendoza",
    "America/Rosario": "America/Argentina/Cordoba",
    "Antarctica/South_Pole": "Pacific/Auckland",
    "Asia/Ashkhabad": "Asia/Ashgabat",
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Chungking": "Asia/Shanghai",
    "Asia/Dacca": "Asia/Dhaka",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Macao": "Asia/Macau",
    "Asia/Rangoon": "Asia/Yangon",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Thimbu": "Asia/Thimphu",
    "Asia/Ujung_Pandang": "Asia/Makassar",
    "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
    "Atlantic/Faeroe": "Atlantic/Faroe",
    "Australia/ACT": "Australia/Sydney",
    "Australia/LHI": "Australia/Lord_Howe",
    "Australia/North": "Australia/Darwin",
    "Australia/NSW": "Australia/Sydney",
    "Australia/Queensland": "Australia/Brisbane",
    "Australia/South": "Australia/Adelaide",
    "Australia/Tasmania": "Australia/Hobart",
    "Australia/Victoria": "Australia/Melbourne",
    "Australia/West": "Australia/Perth",
    "Brazil/Acre": "America/Rio_Branco",
    "Brazil/DeNoronha": "America/Noronha",
    "Brazil/East": "America/Sao_Paulo",
    "Brazil/West": "America/Manaus",
    "Canada/Atlantic": "America/Halifax",
    "Canada/Central": "America/Winnipeg",
    "Canada/Eastern": "America/Toronto",
    "Canada/Mountain": "America/Edmonton",
    "Canada/Newfoundland": "America/St_Johns",
    "Canada/Pacific": "America/Vancouver",
    "Canada/Saskatchewan": "America/Regina",
    "Canada/Yukon": "America/Whitehorse",
    "Chile/Continental": "America/Santiago",
    "Chile/EasterIsland": "Pacific/Easter",
    "Cuba": "America/Havana",
    "Egypt": "Africa/Cairo",
    "Eire": "Europe/Dublin",
    "Europe/Kiev": "Europe/Kyiv",
    "Europe/Uzhgorod": "Europe/Kyiv",
    "Europe/Zaporozhye": "Europe/Kyiv",
    "GB": "Europe/London",
    "GB-Eire": "Europe/London",
    "GMT+0": "Etc/GMT",
    "GMT-0": "Etc/GMT",
    "GMT0": "Etc/GMT",
    "Greenwich": "Etc/GMT",
    "Hongkong": "Asia/Hong_Kong",
    "Iceland": "Africa/Abidjan",
    "Iran": "Asia/Tehran",
    "Israel": "Asia/Jerusalem",
    "Jamaica": "America/Jamaica",
    "Japan": "Asia/Tokyo",
    "Kwajalein": "Pacific/Kwajalein",
    "Libya": "Africa/Tripoli",
    "Mexico/BajaNorte": "America/Tijuana",
    "Mexico/BajaSur": "America/Mazatlan",
    "Mexico/General": "America/Mexico_City",
    "Navajo": "America/Denver",
    "NZ": "Pacific/Auckland",
    "NZ-CHAT": "Pacific/Chatham",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Pacific/Ponape": "Pacific/Guadalcanal",
    "Pacific/Truk": "Pacific/Port_Moresby",
    "Poland": "Europe/Warsaw",
    "Portugal": "Europe/Lisbon",
    "PRC": "Asia/Shanghai",
    "ROC": "Asia/Taipei",
    "ROK": "Asia/Seoul",
    "Singapore": "Asia/Singapore",
    "Türkiye": "Europe/Istanbul",
    "UCT": "Etc/UTC",
    "Universal": "Etc/UTC",
    "US/Alaska": "America/Anchorage",
    "US/Aleutian": "America/Adak",
    "US/Arizona": "America/Phoenix",
    "US/Central": "America/Chicago",
    "US/Eastern": "America/New_York",
    "US/East-Indiana": "America/Indiana/Indianapolis",
    "US/Hawaii": "Pacific/Honolulu",
    "US/Indiana-Starke": "America/Indiana/Knox",
    "US/Michigan": "America/Detroit",
    "US/Mountain": "America/Denver",
    "US/Pacific": "America/Los_Angeles",
    "US/Samoa": "Pacific/Pago_Pago",
    "W-SU": "Europe/Moscow",
    "Zulu": "Etc/UTC",
}

original_pytz_timezone = pytz.timezone


def patch_pytz():
    def timezone(name):
        if name not in pytz.all_timezones_set and name in _tz_mapping:
            name = _tz_mapping[name]
        return original_pytz_timezone(name)

    pytz.timezone = timezone
    register({'pytz': pytz})
