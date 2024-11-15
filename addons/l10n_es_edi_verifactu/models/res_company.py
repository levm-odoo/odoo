# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_es_edi_verifactu_certificate_id = fields.Many2one(
        string="Certificate (Veri*Factu)",
        store=True,
        readonly=False,
        comodel_name='l10n_es_edi_verifactu.certificate',
        compute="_compute_l10n_es_edi_verifactu_certificate",
    )
    l10n_es_edi_verifactu_certificate_ids = fields.One2many(
        comodel_name='l10n_es_edi_verifactu.certificate',
        inverse_name='company_id',
    )
    l10n_es_edi_verifactu_test_environment = fields.Boolean(
        string="Test Environment",
        default=True,
    )
    l10n_es_edi_verifactu_endpoints = fields.Binary(
        compute='_compute_l10n_es_edi_verifactu_endpoints',
        string='Veri*Factu Endpoints',
    )

    @api.depends('country_id', 'l10n_es_edi_verifactu_certificate_ids')
    def _compute_l10n_es_edi_verifactu_certificate(self):
        for company in self:
            if company.country_code == 'ES':
                company.l10n_es_edi_verifactu_certificate_id = self.env['l10n_es_edi_verifactu.certificate'].search(
                    [('company_id', '=', company.id)],
                    order='date_end desc',
                    limit=1,
                )
            else:
                company.l10n_es_edi_verifactu_certificate_id = False

    @api.depends('l10n_es_edi_verifactu_test_environment')
    def _compute_l10n_es_edi_verifactu_endpoints(self):
        # TODO:
        TEST_ENDPOINT = "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"  # required
        QR_TEST_ENDPOINT = "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR"  # required
        # TEST_ENDPOINT = "https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"  # required; certificado de sello
        # TEST_ENDPOINT = "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/RequerimientoSOAP"  # on demand;

        for company in self:
            if company.l10n_es_edi_verifactu_test_environment:
                endpoints = {
                    'verifactu': TEST_ENDPOINT,
                    'QR': QR_TEST_ENDPOINT
                }
            else:
                endpoints = {
                    'verifactu': TEST_ENDPOINT,
                    'QR': QR_TEST_ENDPOINT
                }
            company.l10n_es_edi_verifactu_endpoints = endpoints

    def _get_l10n_es_edi_verifactu_values(self):
        return {
            company: {
                'name': company.name,
                'NIF': company.vat[2:] if company.vat.startswith('ES') else company.vat,
            }
            for company in self
        }
