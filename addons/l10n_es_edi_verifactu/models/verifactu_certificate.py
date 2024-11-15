# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from base64 import b64decode
from pytz import timezone
from datetime import datetime

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.addons.account.tools.certificate import load_key_and_certificates


# TODO: ?: common certificate for all things spain?
# TODO: check 18.0
class Certificate(models.Model):
    _name = 'l10n_es_edi_verifactu.certificate'
    _description = 'Certificate'
    _order = 'date_start desc, id desc'
    _rec_name = 'date_start'

    company_id = fields.Many2one(
        comodel_name='res.company',
        string="Company",
        required=True,
        default=lambda self: self.env.company,
        ondelete='cascade',
    )
    serial_number = fields.Char(
        readonly=True,
        index=True,
    )
    content = fields.Binary(
        string="Certificate",
        required=True,
        attachment=False,
        help="PFX Certificate",  # TODO:
    )
    password = fields.Char(
        help="Passphrase for the PFX certificate",  # TODO:
        groups="base.group_system",
    )
    date_start = fields.Datetime(
        string="Available date",
        readonly=True,
        help="The date on which the certificate starts to be valid",
    )
    date_end = fields.Datetime(
        string="Expiration date",
        readonly=True,
        help="The date on which the certificate expires",
    )

    # TODO: move?
    @api.model
    def _get_es_current_datetime(self):
        """Get the current datetime with the Spanish timezone. """
        return datetime.now(timezone('Europe/Madrid'))

    def _decode_certificate(self):
        """
        Return certificate data

        :return tuple: private_key, certificate
        """
        self.ensure_one()
        content, password = b64decode(self.with_context(bin_size=False).content), self.password.encode() if self.password else None
        return load_key_and_certificates(content, password)

    @api.model_create_multi
    def create(self, vals_list):
        certificates = super().create(vals_list)
        for certificate in certificates:
            try:
                _key, certif = certificate._decode_certificate()
            except ValueError:
                raise UserError(_('There has been a problem with the certificate, some usual problems can be:\n'
                                  '\t- The password given or the certificate are not valid.\n'
                                  '\t- The certificate content is invalid.'))
            if fields.datetime.now() > certif.not_valid_after:
                raise UserError(_('The certificate is expired since %s', certif.not_valid_after))
            # Assign extracted values from the certificate
            certificate.write({'serial_number': certif.serial_number, 'date_start': certif.not_valid_before, 'date_end': certif.not_valid_after})
        return certificates
