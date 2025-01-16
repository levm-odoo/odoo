# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json
import logging
import re
import requests

from stdnum.eu.vat import check_vies

from odoo import api, fields, models, _
from odoo.tools.image import base64_to_image

_logger = logging.getLogger(__name__)

PARTNER_AC_TIMEOUT = 5
SUPPORTED_VAT_PREFIXES = {
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI',
    'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL',
    'PT', 'RO', 'SE', 'SI', 'SK', 'XI', 'EU'}
VAT_COUNTRY_MAPPING = {
    'EL': 'GR',  # Greece
    'XI': 'GB',  # United Kingdom (Northern Ireland)
}


class ResPartner(models.Model):
    _inherit = 'res.partner'

    partner_gid = fields.Integer('Company database ID')
    additional_info = fields.Char('Additional info')

    @api.model
    def _iap_replace_location_codes(self, iap_data):
        country_code, country_name = iap_data.pop('country_code', False), iap_data.pop('country_name', False)
        state_code, state_name = iap_data.pop('state_code', False), iap_data.pop('state_name', False)

        country, state = None, None
        if country_code:
            country = self.env['res.country'].search([['code', '=ilike', country_code]])
        if not country and country_name:
            country = self.env['res.country'].search([['name', '=ilike', country_name]])

        if country:
            if state_code:
                state = self.env['res.country.state'].search([
                    ('country_id', '=', country.id), ('code', '=ilike', state_code)
                ], limit=1)
            if not state and state_name:
                state = self.env['res.country.state'].search([
                    ('country_id', '=', country.id), ('name', '=ilike', state_name)
                ], limit=1)

        if country:
            iap_data['country_id'] = {'id': country.id, 'display_name': country.display_name}
        if state:
            iap_data['state_id'] = {'id': state.id, 'display_name': state.display_name}

        return iap_data

    @api.model
    def _iap_replace_language_codes(self, iap_data):
        if lang := iap_data.pop('preferred_language', False):
            if installed_lang := (
                self.env['res.lang'].search([('iso_code', '=', lang)])  # specific lang (e.g.: fr_BE)
                or
                self.env['res.lang'].search([('iso_code', 'ilike', lang[:2])], limit=1)  # fallback to generic lang (e.g. fr)
            ):
                iap_data['lang'] = installed_lang.code
        return iap_data

    @api.model
    def _format_data_company(self, iap_data):
        self._iap_replace_location_codes(iap_data)
        self._iap_replace_language_codes(iap_data)
        return iap_data

    @api.model
    def autocomplete_by_name(self, query, timeout=15):
        suggestions, _ = self.env['iap.autocomplete.api']._request_partner_autocomplete('search_by_name', {
            'query': query,
        }, timeout=timeout)
        if suggestions:
            results = []
            for suggestion in suggestions:
                results.append(self._format_data_company(suggestion))
            return results
        else:
            return []

    @api.model
    def autocomplete_by_vat(self, vat, timeout=15):
        suggestions, _ = self.env['iap.autocomplete.api']._request_partner_autocomplete('search_by_vat', {
            'query': vat,
        }, timeout=timeout)
        if suggestions:
            results = []
            for suggestion in suggestions:
                results.append(self._format_data_company(suggestion))
            return results
        else:
            vies_result = None
            try:
                vies_result = check_vies(vat, timeout=timeout)
            except Exception:
                _logger.warning("Failed VIES VAT check.", exc_info=True)
            if vies_result:
                name = vies_result['name']
                if vies_result['valid'] and name != '---':
                    address = list(filter(bool, vies_result['address'].split('\n')))
                    street = address[0]
                    zip_city_record = next(filter(lambda addr: re.match(r'^\d.*', addr), address[1:]), None)
                    zip_city = zip_city_record.split(' ', 1) if zip_city_record else [None, None]
                    street2 = next((addr for addr in filter(lambda addr: addr != zip_city_record, address[1:])), None)
                    return [self._iap_replace_location_codes({
                        'name': name,
                        'vat': vat,
                        'street': street,
                        'street2': street2,
                        'city': zip_city[1],
                        'zip': zip_city[0],
                        'country_code': vies_result['countryCode'],
                    })]
            return []

    @api.model
    def enrich_company(self, duns, timeout=15):
        response, error = self.env['iap.autocomplete.api']._request_partner_autocomplete('enrich', {
            'duns': duns,
        }, timeout=timeout)
        if response and response.get('company_data'):
            result = self._format_data_company(response.get('company_data'))
        else:
            result = {}

        if response and response.get('credit_error'):
            result.update({
                'error': True,
                'error_message': 'Insufficient Credit'
            })
        elif error:
            result.update({
                'error': True,
                'error_message': error
            })
        return result

    def iap_partner_autocomplete_add_tags(self, unspsc_codes):
        """Called by JS to create the activity tags from the UNSPSC codes"""
        self.ensure_one()

        # If the UNSPSC module is installed, we might have a translation, so let's use it
        if self.env['ir.module.module']._get('product_unspsc').state == 'installed':
            tag_names = self.env['product.unspsc.code']\
                            .with_context(active_test=False)\
                            .search([('code', 'in', [unspsc_code for unspsc_code, __ in unspsc_codes])])\
                            .mapped('name')
        # If it's not, then we use the default English name provided by DnB
        else:
            tag_names = [unspsc_name for __, unspsc_name in unspsc_codes]

        tag_ids = self.env['res.partner.category']
        for tag_name in tag_names:
            if existing_tag := self.env['res.partner.category'].search([('name', '=', tag_name)]):
                tag_ids |= existing_tag
            else:
                tag_ids |= self.env['res.partner.category'].create({'name': tag_name})
        self.category_id = tag_ids

    @api.model
    def _is_company_in_europe(self, partner_country_code, vat_country_code):
        return partner_country_code == VAT_COUNTRY_MAPPING.get(vat_country_code, vat_country_code)

    def _is_vat_syncable(self, vat):
        if not vat:
            return False
        vat_country_code = vat[:2]
        partner_country_code = self.country_id.code if self.country_id else ''

        # Check if the VAT prefix is supported and corresponds to the partner's country or no country is set
        is_vat_supported = (
            vat_country_code in SUPPORTED_VAT_PREFIXES
            and (self._is_company_in_europe(partner_country_code, vat_country_code) or not partner_country_code))

        is_gst_supported = (
            self.check_gst_in(vat)
            and partner_country_code == self.env.ref('base.in').code or not partner_country_code)

        return is_vat_supported or is_gst_supported

    def check_gst_in(self, vat):
        # reference from https://www.gstzen.in/a/format-of-a-gst-number-gstin.html
        if vat and len(vat) == 15:
            all_gstin_re = [
                r'\d{2}[a-zA-Z]{5}\d{4}[a-zA-Z][1-9A-Za-z][Zz1-9A-Ja-j][0-9a-zA-Z]',  # Normal, Composite, Casual GSTIN
                r'\d{4}[A-Z]{3}\d{5}[UO]N[A-Z0-9]',  # UN/ON Body GSTIN
                r'\d{4}[a-zA-Z]{3}\d{5}NR[0-9a-zA-Z]',  # NRI GSTIN
                r'\d{2}[a-zA-Z]{4}[a-zA-Z0-9]\d{4}[a-zA-Z][1-9A-Za-z][DK][0-9a-zA-Z]',  # TDS GSTIN
                r'\d{2}[a-zA-Z]{5}\d{4}[a-zA-Z][1-9A-Za-z]C[0-9a-zA-Z]'  # TCS GSTIN
            ]
            return any(re.match(rx, vat) for rx in all_gstin_re)
        return False

    def _is_synchable(self):
        already_synched = self.env['res.partner.autocomplete.sync'].search([('partner_id', '=', self.id), ('synched', '=', True)])
        return self.is_company and self.partner_gid and not already_synched

    def _update_autocomplete_data(self, vat):
        self.ensure_one()
        if vat and self._is_synchable() and self._is_vat_syncable(vat):
            self.env['res.partner.autocomplete.sync'].sudo().add_to_queue(self.id)

    @api.model_create_multi
    def create(self, vals_list):
        partners = super(ResPartner, self).create(vals_list)
        if len(vals_list) == 1:
            partners._update_autocomplete_data(vals_list[0].get('vat', False))
        return partners

    def write(self, values):
        res = super(ResPartner, self).write(values)
        if len(self) == 1:
            self._update_autocomplete_data(values.get('vat', False))
        return res

    @api.model
    def _get_view(self, view_id=None, view_type='form', **options):
        arch, view = super()._get_view(view_id, view_type, **options)

        if view_type == 'form':
            for node in arch.xpath("//field[@name='name' or @name='vat' or @name='duns']"):
                node.set('widget', 'field_partner_autocomplete')

        return arch, view
