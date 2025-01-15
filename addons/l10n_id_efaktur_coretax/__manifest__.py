# -*- encoding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Indonesia E-faktur (Coretax)',
    'icon': '/l10n_id/static/description/icon.png',
    'version': '1.0',
    'description': """
        E-invoicing feature provided by DJP (Indonesian Tax Office). As of January 1st 2025,
        Indonesia has shifted to CoreTax, which requires the format of e-Faktur to be shifted as well
    """,
    'category': 'Accounting/Localizations/EDI',
    'depends': ['l10n_id', 'l10n_id_efaktur'],
    'data': [
        # Extra data
        'data/l10n_id_efaktur_coretax.product.code.csv',
        'data/l10n_id_efaktur_coretax.uom.code.csv',
        'data/uom.uom.csv',
        'data/res.country.csv',
        'data/efaktur_templates.xml',

        # Security
        'security/ir.model.access.csv',

        # Views
        'views/res_partner.xml',
        'views/product_template.xml',
        'views/account_move.xml',
    ],
    'installable': True,
    'license': 'LGPL-3',
}
