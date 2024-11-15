import hashlib
import math
from base64 import b64encode, encodebytes
from pytz import timezone

from copy import deepcopy
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree
from uuid import uuid4

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import cleanup_xml_node, float_repr
import odoo.release

VERIFACTU_VERSION = "1.0"

NS_MAP = {
    'ds': "http://www.w3.org/2000/09/xmldsig#",
    'soapenv': "http://schemas.xmlsoap.org/soap/envelope/",
}


def _path_get(dictionary, slash_path, default=None):
    x = dictionary
    for field in slash_path.split('/'):
        if field not in x:
            return default
        x = x[field]
    return x

# TODO: ?: move function
def _canonicalize_node(node, **kwargs):
    """
    Returns the canonical representation of node.
    Specified in: https://www.w3.org/TR/2001/REC-xml-c14n-20010315
    Required for computing digests and signatures.
    Returns an UTF-8 encoded bytes string.
    """
    return etree.tostring(node, method="c14n", with_comments=False, **kwargs)

# TODO: ?: move function
def _get_uri(uri, reference, base_uri=""):
    """
    Returns the content within `reference` that is identified by `uri`.
    Canonicalization is used to convert node reference to an octet stream.
    - URIs starting with # are same-document references
    https://www.w3.org/TR/xmldsig-core/#sec-URI
    - Empty URIs point to the whole document tree, without the signature
    https://www.w3.org/TR/xmldsig-core/#sec-EnvelopedSignature
    Returns an UTF-8 encoded bytes string.
    """
    transform_nodes = reference.findall(".//{*}Transform")
    # handle exclusive canonization
    exc_c14n = bool(transform_nodes) and transform_nodes[0].attrib.get('Algorithm') == 'http://www.w3.org/2001/10/xml-exc-c14n#'
    prefix_list = []
    if exc_c14n:
        inclusive_ns_node = transform_nodes[0].find(".//{*}InclusiveNamespaces")
        if inclusive_ns_node is not None and inclusive_ns_node.attrib.get('PrefixList'):
            prefix_list = inclusive_ns_node.attrib.get('PrefixList').split(' ')

    node = deepcopy(reference.getroottree().getroot())
    if uri == base_uri:
        # Base URI: whole document, without signature (default is empty URI)
        for signature in node.findall('.//ds:Signature', namespaces=NS_MAP):
            if signature.tail:
                # move the tail to the previous node or to the parent
                if (previous := signature.getprevious()) is not None:
                    previous.tail = "".join([previous.tail or "", signature.tail or ""])
                else:
                    signature.getparent().text = "".join([signature.getparent().text or "", signature.tail or ""])
            signature.getparent().remove(signature)  # we can only remove a node from its direct parent
        return _canonicalize_node(node, exclusive=exc_c14n, inclusive_ns_prefixes=prefix_list)

    if uri.startswith("#"):
        path = "//*[@*[local-name() = '{}' ]=$uri]"
        results = node.xpath(path.format("Id"), uri=uri.lstrip("#"))  # case-sensitive 'Id'
        if len(results) == 1:
            return _canonicalize_node(results[0], exclusive=exc_c14n, inclusive_ns_prefixes=prefix_list)
        if len(results) > 1:
            raise UserError(f"Ambiguous reference URI {uri} resolved to {len(results)} nodes")

    raise UserError(f'URI {uri} not found')

# TODO: ?: move function
def _reference_digests(node, base_uri=""):
    """
    Processes the references from node and computes their digest values as specified in
    https://www.w3.org/TR/xmldsig-core/#sec-DigestMethod
    https://www.w3.org/TR/xmldsig-core/#sec-DigestValue
    """
    for reference in node.findall("ds:Reference", namespaces=NS_MAP):
        ref_node = _get_uri(reference.get("URI", ""), reference, base_uri=base_uri)
        lib = hashlib.new("sha256", ref_node)
        reference.find("ds:DigestValue", namespaces=NS_MAP).text = b64encode(lib.digest())

# TODO: ?: move
def _int_to_bytes(number):
    """ Converts an integer to a byte string (in smallest big-endian form). """
    return number.to_bytes((number.bit_length() + 7) // 8, byteorder='big')

class L10nEsEdiVerifactuXml(models.AbstractModel):
    # TODO: docstring
    _name = 'l10n_es_edi_verifactu.xml'
    _description = "Veri*Factu EDI XML"

    # -------------------------------------------------------------------------
    # EXPORT
    # -------------------------------------------------------------------------

    @api.model
    def _check_value(self, value, value_type):
        errors = []
        # TODO: implement check
        # TODO: NIFType: max length 9
        return errors

    @api.model
    def _format_date_fecha_type(self, date):
        # TODO: according to type fecha from xsd
        return date.strftime('%d-%m-%Y')

    # TODO: make function in l10n_es ?
    @api.model
    def _get_invoice_tipos(self, invoice):
        result = {
            'TipoFactura': None,
            'TipoRectificativa': None,
        }
        if invoice.move_type == 'out_invoice':
            result['TipoFactura'] = 'F2' if invoice.l10n_es_is_simplified else 'F1'
        elif invoice.move_type == 'out_refund':
            result['TipoFactura'] = 'R5' if invoice.l10n_es_is_simplified else 'R1'
            result['TipoRectificativa'] = 'I'
        elif invoice.move_type == 'in_invoice':
            result['TipoFactura'] = 'F1'
            if invoice._l10n_es_is_dua():
                result['TipoFactura'] = 'F5'
        elif invoice.move_type == 'in_refund':
            result['TipoFactura'] = 'R4'
            result['TipoRectificativa'] = 'I'
        return result

    @api.model
    def _export_invoice_vals(self, invoice):
        # TODO:?: better flow; TODO: could maybe add step for substitution / cancellation, chaining and Incidencia
        # . export_invoice_vals / export_MODEL_vals
        #       * independent of chaining
        #       * independent of cancellation; should export enough info for both if possible
        #       * information about pre-existing models maybe?
        # ⇝ export_render_vals (checks input values)
        #       * flag: cancellation or not
        #       * ?: independent of chaining
        # ⇝ render (checks input values)
        #       * ?: add chaining
        invoice.ensure_one()
        invoice = invoice.with_context(lang=invoice.partner_id.lang)
        errors = []
        vals = {}

        vals['record'] = invoice

        company = invoice.company_id
        if not company:
            errors.append(_("Please set a company on the invoice."))
            return errors
        vals['company'] = company

        # TODO: check for errors

        vals['identifier'] = invoice.name
        vals['invoice_date'] = invoice.invoice_date
        vals['delivery_date'] = invoice.delivery_date

        vals['partner'] = invoice.commercial_partner_id

        vals['verifactu_state'] = invoice.l10n_es_edi_verifactu_state

        oss_tag = self.env.ref('l10n_eu_oss.tag_oss', raise_if_not_found=False)
        def grouping_key_generator(base_line, tax_values):
            tax = tax_values['tax_repartition_line'].tax_id

            l10n_es_exempt_reason = tax.l10n_es_exempt_reason if tax.l10n_es_type == 'exento' else False

            verifactu_tax_type = tax.l10n_es_edi_verifactu_tax_type

            # we do not want to mix the same tax with recargo and the same tax without recargo
            # TODO:?: maybe we do
            # TODO: maybe put recargo tax directly here?
            # NOTE: we assume there is only a single (main_tax, recargo_tax) pair on a single base_line
            with_recargo = False
            if tax.l10n_es_type in ('sujeto', 'sujeto_isp'):
                # TODO: other sujeto types; e.g. 'sujeto_agricultura'?
                # TODO: function for sujecto / no sujeto
                # TODO: sync with `recargo_tax_details_key` generation
                with_recargo = base_line['taxes'].filtered(lambda t: t.l10n_es_type == 'recargo')

            regimen_key = None
            VAT = verifactu_tax_type == '01'
            IGIC = verifactu_tax_type == '03'
            if VAT or IGIC:
                is_oss = oss_tag and oss_tag in tax_values['tax_repartition_line'].tag_ids
                export_exempts = l10n_es_exempt_reason == 'E2'
                if VAT and with_recargo:
                    regimen_key = '18'
                elif VAT and is_oss:
                    regimen_key = '17'
                elif export_exempts:
                    regimen_key = '02'
                else:
                    regimen_key = '01'
                # TODO: ?: special code for simplified invoices
                # TODO: different for purchase documents ⦓see sii⦔

            grouping_key = {
                'amount': tax.amount,
                'ClaveRegimen': regimen_key,
                'with_recargo': with_recargo,
                'l10n_es_bien_inversion': tax.l10n_es_bien_inversion,  # TODO: currently unused
                'l10n_es_edi_verifactu_tax_type': verifactu_tax_type,
                'l10n_es_exempt_reason': l10n_es_exempt_reason,
                'l10n_es_type': tax.l10n_es_type,
            }
            return grouping_key

        def filter_to_apply(base_line, tax_values):
            # NOTE: / TODO: check; taken from sii currently
            return (tax_values['tax_repartition_line'].factor_percent > 0.0
                    and tax_values['tax_repartition_line'].tax_id.amount != -100.0
                    and tax_values['tax_repartition_line'].tax_id.l10n_es_type != 'ignore')

        def full_filter_invl_to_apply(invoice_line):
            # NOTE: / TODO: check; taken from sii currently
            return any(t != 'ignore' for t in invoice_line.tax_ids.flatten_taxes_hierarchy().mapped('l10n_es_type'))

        vals['tipos'] = self._get_invoice_tipos(invoice)  # TODO: maybe rather computed in render values?
        vals['tax_details'] = invoice._prepare_invoice_aggregated_taxes(
            filter_invl_to_apply=full_filter_invl_to_apply,
            filter_tax_values_to_apply=filter_to_apply,
            grouping_key_generator=grouping_key_generator,
        )
        print(">> _export_invoice_vals :: tax_details")
        from rich.pretty import pprint
        pprint(vals['tax_details'])
        print("<< _export_invoice_vals :: tax_details")

        vals['sign'] = -1 if invoice.move_type in ('out_refund', 'in_refund') else 1

        vals['description'] = invoice.invoice_origin[:500] if invoice.invoice_origin else None

        return vals, errors

    @api.model
    def _render_vals(self, vals, cancellation=False, previous_record_render_vals=None):
        errors = []

        main_render_vals_key = 'RegistroAnulacion' if cancellation else 'RegistroAlta'
        render_vals = {
            '_path_get': _path_get,
            'vals': {
                main_render_vals_key: {},
            },
            'record': vals['record'],
            'cancellation': cancellation,
        }
        main_render_vals = render_vals['vals'][main_render_vals_key]

        company = vals['company']
        company_values = company._get_l10n_es_edi_verifactu_values()[company]
        company_name = company_values['name'][:120]
        self._check_value(company_values['NIF'], 'NIFType')
        self._check_value(company_name, 'TextMax120Type')

        partner = vals['partner']
        if not partner.name:
            errors.append('Missing partner name')
        partner_name = (partner.name or '')[:120]
        partner_vat = partner.vat or ''
        partner_NIF = partner_vat[2:] if partner_vat.startswith('ES') else partner_vat
        # TODO: case no vat? see PersonaFisicaJuridicaType
        # TODO: case neither? error

        self._check_value(vals['identifier'], 'TextoIDFacturaType')

        invoice_date = vals['invoice_date']
        if invoice_date:
            invoice_date = self._format_date_fecha_type(invoice_date)
            self._check_value(invoice_date, 'fecha')
        else:
            errors.append("Missing invoice date.")  # TODO: error messages

        delivery_date = vals['delivery_date']
        if delivery_date:
            delivery_date = self._format_date_fecha_type(delivery_date)
            self._check_value(delivery_date, 'fecha')

        tipos = vals['tipos']
        # TODO: check TipoFactura?

        # NOTE: / TODO: CORRECTION; see "Sistemas Informáticos de Facturación y Sistemas VERI*FACTU" Version 1.0.0 - "Validaciones" p. 22
        # In the following `record` is not the XML / document but the invoice / ... the `record` is about
        # submission:
        #     `record` was never sent to the AEAT before
        #       * [optional] Subsanacion: N
        #       * [optional] RechazoPrevio: N
        #     `record` was sent before but rejected
        #       * Subsanacion: S
        #       * RechazoPrevio: X
        # substitution:
        #     `record` registered with AEAT already
        #       * Subsanacion: S
        #       * [optional] RechazoPrevio: N
        #     `record` registered with AEAT; previous correction was rejected
        #       * Subsanacion: S
        #       * RechazoPrevio: S
        #     `record` does not exist at AEAT and did not have to (i.e. switched to Veri*Factu after original invoice was sent)
        #       * Subsanacion: S
        #       * RechazoPrevio: X
        verifactu_state = vals['verifactu_state']
        substitution = False
        if verifactu_state in ('registered_with_errors', 'accepted'):
            substitution = True
        previously_rejected_state = 'N'
        submission_rejected_before = False
        if not substitution and submission_rejected_before:
            previously_rejected_state = 'X'
        correction_rejected_before = False
        if substitution and correction_rejected_before:
            previously_rejected_state = 'S'
        corrected_record_does_not_exist_at_AEAT = False
        if substitution and corrected_record_does_not_exist_at_AEAT:
            previously_rejected_state = 'X'

        # TODO: currently displayed in spanish timezone; may not be necessary
        generation_time_string = fields.Datetime.now(timezone('Europe/Madrid')).astimezone(timezone('Europe/Madrid')).isoformat()

        if cancellation:
            main_render_vals.update({
                'IDVersion': VERIFACTU_VERSION,
                'IDFactura': {
                    'IDEmisorFacturaAnulada': company_values['NIF'],
                    'NumSerieFacturaAnulada': vals['identifier'],
                    'FechaExpedicionFacturaAnulada': invoice_date, # TODO: maybe it should be accounting date?
                },
                'NombreRazonEmisor': company_name,
                'SinRegistroPrevio': 'S' if corrected_record_does_not_exist_at_AEAT else 'N',
                'RechazoPrevio': previously_rejected_state,
                'GeneradoPor': None,  # TODO:
                'Generador': None,  # TODO:
                'Encadenamiento': {},  # will be filled below
                'SistemaInformatico': {},  # will be filled below
                'FechaHoraHusoGenRegistro': generation_time_string,
                'dsig': {},  # will be filled below
            })
        else:
            main_render_vals.update({
                'IDVersion': VERIFACTU_VERSION,
                'IDFactura': {
                    'IDEmisorFactura': company_values['NIF'],
                    'NumSerieFactura': vals['identifier'],
                    'FechaExpedicionFactura': invoice_date, # TODO: maybe it should be accounting date?
                },
                'NombreRazonEmisor': company_name,
                'Subsanacion': 'S' if substitution else 'N',
                'RechazoPrevio': None,  # TODO:
                'TipoFactura': tipos['TipoFactura'],
                'TipoRectificativa': tipos['TipoRectificativa'],  # may be None
                'FechaOperacion': delivery_date if delivery_date and delivery_date != invoice_date else None,
                'DescripcionOperacion': vals['description'] or 'manual',
                # TODO: ?: maybe no Destinatarios if is_simplified
                'Destinatarios': {
                    'IDDestinatario': {
                        'NombreRazon': partner_name,
                        'NIF': partner_NIF,
                    },
                },
                'Desglose': {},  # will be filled below
                'CuotaTotal': None,  # will be filled below
                'ImporteTotal': None,  # will be filled below
                'Encadenamiento': {},  # will be filled below
                'SistemaInformatico': {},  # will be filled below
                'FechaHoraHusoGenRegistro': generation_time_string,
                'dsig': {},  # will be filled below
            })
            vals_money, errors_money = self._render_vals_monetary_amounts(vals)
            errors.extend(errors_money)
            if not errors_money:
                main_render_vals.update(vals_money)

        main_render_vals['TipoHuella'] = "01"  # "01" means SHA-256
        main_render_vals['Huella'] = self._fingerprint(render_vals['vals'], cancellation=cancellation)

        # TODO: get rid of kwarg
        vals_Encadenamiento, errors_Encadenamiento = self._render_vals_Encadenamiento(vals, previous_record_render_vals=previous_record_render_vals)
        errors.extend(errors_Encadenamiento)
        if not errors_Encadenamiento:
            main_render_vals.update(vals_Encadenamiento)

        vals_dsig, errors_dsig = self._render_vals_dsig(vals)
        errors.extend(errors_dsig)
        if not errors_dsig:
            main_render_vals.update(vals_dsig)

        vals_SistemaInformatico, errors_SistemaInformatico = self._render_vals_SistemaInformatico(vals)
        errors.extend(errors_SistemaInformatico)
        if not errors_SistemaInformatico:
            main_render_vals.update(vals_SistemaInformatico)

        return render_vals, errors

    @api.model
    def _render_vals_monetary_amounts(self, vals):
        # NOTE: / TODO:  only relevant for 'RegistroAnterior'
        errors = []

        ########## >> generate Desglose
        detalles = []
        tax_details = vals['tax_details']

        # TODO: common function for SII and this
        # TODO: currently: logic adapted from SII
        recargo_tax_details_key = {} # dict (tax_key -> recargo_tax_key)
        for tax_details_per_record in tax_details['tax_details_per_record'].values():
            record_tax_details = tax_details_per_record['tax_details']
            main_key = None
            recargo_key = None
            # NOTE: we assume there is only a single (main_tax, recargo_tax) on a single line
            for key in record_tax_details:
                if key['with_recargo']:
                    main_key = key
                if key['l10n_es_type'] == 'recargo':
                    recargo_key = key
                if main_key and recargo_key:
                    break
            recargo_tax_details_key[main_key] = recargo_key

        # NOTE: / TODO:
        sign = vals['sign']
        for key, tax_detail in tax_details['tax_details'].items():
            tax_type = tax_detail['l10n_es_type']
            if tax_type == 'recargo':
                # recargo taxes are only used in combination with a sujeto tax
                continue

            exempt_reason = tax_detail['l10n_es_exempt_reason']  # only set if exempt

            tax_percentage = tax_detail['amount']
            base_amount = sign * tax_detail['base_amount']
            tax_amount = round(math.copysign(tax_detail['tax_amount'], base_amount), 2)

            verifactu_tax_type = tax_detail['l10n_es_edi_verifactu_tax_type']
            clave_regimen = tax_detail['ClaveRegimen']
            if clave_regimen == '06' or verifactu_tax_type in ('02', '05'):
                # TODO: documentation just says "can" not "has to" be filled in
                base_amount_no_sujeto = 0
                base_amount_sujeto = base_amount
            else:
                base_amount_no_sujeto = base_amount
                base_amount_sujeto = None

            calificacion_operacion = None  # reported if not tax-exempt;
            recargo_equivalencia = {}
            tax_type = tax_detail['l10n_es_type']
            if tax_type in ('sujeto', 'sujeto_agricultura', 'sujeto_isp'):
                calificacion_operacion = 'S2' if tax_type == 'sujeto_isp' else 'S1'
                if tax_detail['with_recargo']:
                    recargo_key = recargo_tax_details_key.get(key)
                    recargo_tax_detail = tax_details['tax_details'][recargo_key]
                    # TODO: rounding
                    recargo_tax_percentage = round(recargo_tax_detail['amount'], 2)
                    recargo_tax_amount = round(math.copysign(recargo_tax_detail['tax_amount'], base_amount), 2)
                    recargo_equivalencia.update({
                        'tax_percentage': recargo_tax_percentage,
                        'tax_amount': recargo_tax_amount,
                    })
            elif tax_type in ('no_sujeto', 'no_sujeto_loc'):
                calificacion_operacion = 'N2' if tax_type == 'no_sujeto_loc' else 'N1'
            elif tax_type == 'exento':
                pass  # exempt_reason set already
            else:
                # tax_type in ('no_deducible', 'retencion', 'recargo', 'dua', 'ignore')
                # TODO:?: skip tax_detail if 'ignore'
                pass
            if calificacion_operacion is not None:
                # TODO: check exempt_reason is False
                self._check_value(calificacion_operacion, 'sf:CalificacionOperacionType')
            else:
                self._check_value(exempt_reason, 'sf:OperacionExentaType')

            # TODO: rounding
            # TODO: formatting; maybe in XML?
            detalle = {
                'Impuesto': verifactu_tax_type,
                'ClaveRegimen': clave_regimen,
                'CalificacionOperacion': calificacion_operacion,
                'OperacionExentaType': exempt_reason,
                'TipoImpositivo': tax_percentage,
                'BaseImponibleOimporteNoSujeto': base_amount_no_sujeto,
                'BaseImponibleACoste': base_amount_sujeto,
                'CuotaRepercutida': tax_amount,
                'TipoRecargoEquivalencia': recargo_equivalencia.get("tax_percentage"),
                'CuotaRecargoEquivalencia': recargo_equivalencia.get("tax_amount"),
            }

            detalles.append(detalle)
        ########## << generate Desglose

        total_amount = tax_details['base_amount'] + tax_details['tax_amount']
        tax_amount = tax_details['tax_amount']

        # TODO: rounding
        total_amount_string = float_repr(total_amount, 2)
        total_tax_amount_string = float_repr(tax_amount, 2)
        self._check_value(total_amount_string, 'sf:ImporteSgn12.2Type')
        self._check_value(total_tax_amount_string, 'sf:ImporteSgn12.2Type')

        render_vals = {
            'Desglose': {
                'DetalleDesglose': detalles,
            },
            'CuotaTotal': total_tax_amount_string,
            'ImporteTotal': total_amount_string,
        }

        return render_vals, errors

    @api.model
    def _render_vals_Encadenamiento(self, vals, previous_record_render_vals=None):
        errors = []

        encadenamiento = {}
        render_vals = {
            'Encadenamiento': encadenamiento
        }
        if previous_record_render_vals:
            if 'RegistroAnulacion' in previous_record_render_vals:
                encadenamiento['RegistroAnterior'] = {
                    'IDEmisorFactura': _path_get(previous_record_render_vals, 'RegistroAnulacion/IDFactura/IDEmisorFacturaAnulada'),
                    'NumSerieFactura': _path_get(previous_record_render_vals, 'RegistroAnulacion/IDFactura/NumSerieFacturaAnulada'),
                    'FechaExpedicionFactura': _path_get(previous_record_render_vals, 'RegistroAnulacion/IDFactura/FechaExpedicionFacturaAnulada'),
                    'Huella': _path_get(previous_record_render_vals, 'RegistroAnulacion/Huella'),
                   }
            else:
                encadenamiento['RegistroAnterior'] = {
                    'IDEmisorFactura': _path_get(previous_record_render_vals, 'RegistroAlta/IDFactura/IDEmisorFactura'),
                    'NumSerieFactura': _path_get(previous_record_render_vals, 'RegistroAlta/IDFactura/NumSerieFactura'),
                    'FechaExpedicionFactura': _path_get(previous_record_render_vals, 'RegistroAlta/IDFactura/FechaExpedicionFactura'),
                    'Huella': _path_get(previous_record_render_vals, 'RegistroAlta/Huella'),
                   }
            # TODO:?: 'RegistroAnterior' in `previous_record_render_vals`
            # TODO: check the values
        else:
            encadenamiento['PrimerRegistro'] = "S"

        return render_vals, errors

    @api.model
    def _render_vals_SistemaInformatico(self, vals):
        errors = []

        self.env.cr.execute("SELECT system_identifier FROM pg_control_system();")
        db_identifier = str(self.env.cr.fetchall()[0][0])

        render_vals = {
            'SistemaInformatico': {
                'NombreRazon': 'Odoo',  # TODO: Odoo S.A. ?
                'NIF': 'A39200019',  # TODO: Odoo S.A. NIF / VAT ?
                'NombreSistemaInformatico': odoo.release.product_name,
                'IdSistemaInformatico': '00',  # identifies odoo as product of Odoo the company; TODO: check
                'Version': odoo.release.version,
                'NumeroInstalacion':  db_identifier,  # TODO: check
                'TipoUsoPosibleSoloVerifactu': 'N',  # TODO: sf:SiNoType
                'TipoUsoPosibleMultiOT': 'S',  # TODO: sf:SiNoType
                'IndicadorMultiplesOT': 'N',  # TODO: S iff multiple taxpayers on same DB; TODO: query
            },
        }

        return render_vals, errors

    @api.model
    def _render_vals_dsig(self, vals):
        errors = []
        company = vals['company']
        record_uuid = str(uuid4())

        # TODO: maybe move certificate stuff to the actual signing; else we have to get the certificates again there
        # TODO: also the check whether there is a certificate
        # Ensure a certificate is available.
        certificate = company.l10n_es_edi_verifactu_certificate_id
        if not certificate:
            errors.append(_("Please configure the certificate for Veri*Factu."))
            return errors
        _cert_private, cert_public = certificate._decode_certificate()
        public_key_numbers = cert_public.public_key().public_numbers()

        # TODO: check
        # For e.g. facturae and tbai the authorities requirerd a specific order of the elements
        rfc4514_attr = dict(element.rfc4514_string().split("=", 1) for element in cert_public.issuer.rdns)
        cert_issuer = ", ".join([f"{key}={rfc4514_attr[key]}" for key in ['CN', 'OU', 'O', 'C'] if key in rfc4514_attr])
        render_vals = {
            'dsig': {
                'signature_id': f"signature-{record_uuid}",
                'xmldsig_reference_id': f"xmldsig_reference_id-{record_uuid}",
                'signed_properties_id': f"signed_properties-{record_uuid}",
                'key_info_id': f"key_info_id-{record_uuid}",
                'x509_certificate': encodebytes(cert_public.public_bytes(encoding=serialization.Encoding.DER)).decode(),
                'rsa_key_modulus': encodebytes(_int_to_bytes(public_key_numbers.n)).decode(),
                'rsa_key_exponent': encodebytes(_int_to_bytes(public_key_numbers.e)).decode(),
                'signing_time': fields.Datetime.now().isoformat(),
                'signing_certificate_digest': b64encode(cert_public.fingerprint(hashes.SHA256())).decode(),
                'x509_issuer_name': cert_issuer,
                'x509_serial_number': cert_public.serial_number,
                'sigpolicy_url': "https://sede.administracion.gob.es/politica_de_firma_anexo_1.pdf",
                'sigpolicy_digest': b64encode(cert_public.fingerprint(hashes.SHA256())).decode(),
            }
        }

        return render_vals, errors

    @api.model
    def _fingerprint(self, render_values, cancellation=False):
        """
        Documentation: "Detalle de las especificaciones técnicas para generación de la huella o hash de los registros de facturación"
        # TODO: link
        """
        # TODO: currently only case 3. a) implemented; need to add other cases
        if cancellation:
            fingerprint_values = [
                # TODO: _path_get, potentially missing nodes; currently only done for "Huella"
                ("IDEmisorFacturaAnulada", render_values["RegistroAnulacion"]["IDFactura"]["IDEmisorFacturaAnulada"]),
                ("NumSerieFacturaAnulada", render_values["RegistroAnulacion"]["IDFactura"]["NumSerieFacturaAnulada"]),
                ("FechaExpedicionFacturaAnulada", render_values["RegistroAnulacion"]["IDFactura"]["FechaExpedicionFacturaAnulada"]),
                ("Huella", _path_get(render_values, "RegistroAnulacion/Encadenamiento/RegistroAnterior/Huella") or ''),
                ("FechaHoraHusoGenRegistro", render_values["RegistroAnulacion"]["FechaHoraHusoGenRegistro"]),
            ]
            string = "&".join([f"{field}={value.strip()}" for (field, value) in fingerprint_values])
        else:
            fingerprint_values = [
                # TODO: _path_get, potentially missing nodes; currently only done for "Huella"
                ("IDEmisorFactura", render_values["RegistroAlta"]["IDFactura"]["IDEmisorFactura"]),
                ("NumSerieFactura", render_values["RegistroAlta"]["IDFactura"]["NumSerieFactura"]),
                ("FechaExpedicionFactura", render_values["RegistroAlta"]["IDFactura"]["FechaExpedicionFactura"]),
                ("TipoFactura", render_values["RegistroAlta"]["TipoFactura"]),
                ("CuotaTotal", render_values["RegistroAlta"]["CuotaTotal"]),
                ("ImporteTotal", render_values["RegistroAlta"]["ImporteTotal"]),
                ("Huella", _path_get(render_values, "RegistroAlta/Encadenamiento/RegistroAnterior/Huella") or ''),
                ("FechaHoraHusoGenRegistro", render_values["RegistroAlta"]["FechaHoraHusoGenRegistro"]),
            ]
            string = "&".join([f"{field}={value.strip()}" for (field, value) in fingerprint_values])
        # TODO: ?: urlencode the values?
        hash_string = hashlib.sha256(string.encode('utf-8'))
        return hash_string.hexdigest().upper()

    @api.model
    def _export_record_xml_node(self, record_vals, render_vals):
        # TODO: would be better to pass invoice_vals directly; then there is no need to pass args through
        errors = []
        print(">> _export_record_info :: record_vals")
        from rich.pretty import pprint
        pprint(record_vals)
        print("<< _export_record_info :: record_vals")
        print(">> _export_record_info :: render_vals")
        from rich.pretty import pprint
        pprint(render_vals)
        print("<< _export_record_info :: render_vals")
        try:
            if render_vals['cancellation']:
                xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_registro_anulacion', render_vals)
            else:
                # registration
                xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_registro_alta', render_vals)
        except Exception as e:
            errors.append(_("Error during the rendering of the XML document: %s", e))
            return None, errors

        # TODO: do not cleanup?
        xml_node = cleanup_xml_node(xml, remove_blank_nodes=False, indent_space="    ")
        print(">> _export_record_info")
        print(etree.tostring(xml_node).decode())
        print("<< _export_record_info")

        # sign
        company = record_vals['company']
        certificate = company.l10n_es_edi_verifactu_certificate_id  # TODO: existence is currently checked in _export_invoice_vals
        cert_private, _cert_public = certificate._decode_certificate()
        # TODO: dedicated function? (signature_node, cert_private)
        # TODO: maybe signing should be done at the very end instead (to avoid modifications of the xml)
        signature_node = xml_node.find('ds:Signature', namespaces=NS_MAP)
        signature_node = cleanup_xml_node(signature_node, remove_blank_nodes=False)
        signed_info_node = signature_node.find('ds:SignedInfo', namespaces=NS_MAP)
        _reference_digests(signed_info_node)
        signature = cert_private.sign(_canonicalize_node(signed_info_node), padding.PKCS1v15(), hashes.SHA256())
        signature_node.find('ds:SignatureValue', namespaces=NS_MAP).text = encodebytes(signature)

        return xml_node, None

    @api.model
    def _export_record_xmls(self, batch_info):
        previous_record_render_vals = batch_info['last_generated_record_vals']
        record_vals = batch_info['record_vals']
        for record in batch_info['records']:  # NOTE: / TODO: order!
            record_vals = record_vals.get(record)
            if record_vals is None:
                continue
            cancellation = batch_info['record_cancel'].get(record, False)

            record_info = {
                'xml_node': None,
                'errors': None,
            }
            batch_info['record_info'][record] = record_info
            # TODO: also we should probably save some identifier of the invoice s.t. we can match the response
            #       maybe RegistroAlta/IDFactura/NumSerieFactura
            #       ?: or maybe just all the invoice values
            #       the reverse dictionary should be build when building the record registration XML
            render_vals, errors = self._render_vals(record_vals, cancellation=cancellation, previous_record_render_vals=previous_record_render_vals)
            if errors:
                record_info['errors'] = errors
                continue
            xml_node, errors = self._export_record_xml_node (record_vals, render_vals)
            if errors:
                record_info['errors'] = errors
                continue
            previous_record_render_vals = record_vals
            record_info['xml_node'] = xml_node
        # TODO: ?: update previous record on the company? maybe after sending / registration

    @api.model
    def _batch_xmls(self, batch_info):
        record_info = batch_info['record_info']
        errors = batch_info['errors']
        # TODO: when sending we should probably include all previously generated but not sent records

        # TODO: handle errors in individual invoices
        #   * ?: TODO: filter out invoices that could not have been sent?
        #     invoices_to_send = invoices_to_send.filtered(lambda invoice: not invoices_data[invoice].get('error'))
        #   * ?: TODO: abort

        # TODO: better error handling
        company = batch_info['sending_company']
        # TODO: ?: maybe put the functions on the company instead?
        # TODO: a bit ugly that the values here were already exported for each invoice ...
        cabecera = {
            'ObligadoEmision': {
                'NombreRazon': company.name[:120],
                'NIF': company.vat[2:] if company.vat.startswith('ES') else company.vat,
            },
        }

        # TODO:
        incident = False  # TODO: do e.g when sending failed
        if incident:
            cabecera["RemisionVoluntaria"] = {
                'Incidencia': 'S' if incident else 'N',
            }
            # TODO: case RemisionRequerimiento
        # TODO: switching from volutanry to required and vice versa
 
        vals = {
            'vals': {'Cabecera': cabecera},
            '_path_get': _path_get,
        }
        xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_record_registration', vals)
        xml_node = cleanup_xml_node(xml, remove_blank_nodes=False, indent_space="    ")
        for record, info in record_info.items():
            # TODO: skip invocies with errors
            if info['errors']:
                batch_info['skipped_records'].append(record)
                continue
            # TODO: move RegistroFactura into export_invoice_node
            registro_factura_node = etree.XML('<sum:RegistroFactura xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"/>')
            registro_factura_node.append(info['xml_node'])
            xml_node.append(registro_factura_node)
        # NOTE: / TODO: no cleanup since the invoices are all signed already
        print(">> _batch_xmls")
        print(etree.tostring(xml_node).decode())
        print("<< _batch_xmls")
        batch_info['xml'] = etree.tostring(xml_node, xml_declaration=True, encoding='UTF-8')

        # TODO: build soap request directly (instead of only wrapping it on send)

        if errors:
            for info in record_info.values():
                info['errors'].extend(errors)

    @api.model
    def _build_soap_request_xml(self, edi_xml):
        envelope_string = self.env['ir.qweb']._render('l10n_es_edi_verifactu.soap_request_verifactu')
        envelope = etree.fromstring(envelope_string)
        body = envelope.find(".//soapenv:Body", namespaces=NS_MAP)
        body.append(etree.fromstring(edi_xml))
        return etree.tostring(envelope)

    @api.model
    def _export_records_query_xml(self, invoices):
        # TODO: ?: maybe put on the company?

        errors = []
        # TODO: better error handling
        company = invoices.company_id
        company.ensure_one()  # TODO: check that every invoice has a company too

        # TODO: sent invoices: 'ObligadoEmision'
        # TODO: received invoices: 'Destinario'
        cabecera = {
             'IDVersion': VERIFACTU_VERSION,
            'ObligadoEmision': {
                'NombreRazon': company.name[:120],
                'NIF': company.vat[2:] if company.vat.startswith('ES') else company.vat,
            },
        }
        filtro_consulta = {
            # TODO: more flexible PeriodoImputacion
            'PeriodoImputacion': {
                'Ejercicio': '2024',
                'Periodo': '12',
            },
        }
        vals = {
            'vals': {
                'Cabecera': cabecera,
                'FiltroConsulta': filtro_consulta,
            },
            '_path_get': _path_get,
        }
        # TODO: query single invoice / customer or other periods
        xml = self.env['ir.qweb']._render('l10n_es_edi_verifactu.verifactu_record_query', vals)
        xml_node = cleanup_xml_node(xml, remove_blank_nodes=False, indent_space="    ")
        print(">> _export_invoice_query_xml")
        print(etree.tostring(xml_node).decode())
        print("<< _export_invoice_query_xml")
        xml = etree.tostring(xml_node, xml_declaration=True, encoding='UTF-8')

        # TODO: build soap request directly (instead of only wrapping it on send)

        return {
            'xml': xml,
            'errors': errors,
        }

    @api.model
    def _export_records_registration_xml(self, records, records_to_cancel=None, previous_record_render_vals=None):
        # TODO: invoice specific currently;
        # TODO: ?: refactor to get rid of batch_info and start directly with record values
        batch_info = {
            'xml': None,  # TODO:
            'sending_company': self.env.company.ensure_one(),  # TODO:
            'records': records,
            'record_cancel': {record: True for record in records_to_cancel or {}},
            'record_vals': {},
            'record_info': {},  # TODO: default dict
            'skipped_records': [],  # TODO: NEXT: skipping vs chaining?
            'last_generated_record_vals': previous_record_render_vals, # TODO:
            'errors': [], # TODO:
        }

        skipped_records = batch_info['skipped_records']
        record_vals = batch_info['record_vals']
        # TODO: ?: put 'record_cancel' in `_export_invoice_vals`
        for record in batch_info['records']:
            vals, errors = self.env['l10n_es_edi_verifactu.xml']._export_invoice_vals(record)
            if errors:
                skipped_records.append(record)
                # TODO: output error to record_info
            else:
                record_vals[record] = vals

        # TODO:?: better flow? simplify or get rid of batch_info
        # records ⇝ record_values (incl. cancellation or not) ⇝ render_values (need previous record values here) ⇝ xml_node
        # export_xml_nodes(record_values)
        self.env['l10n_es_edi_verifactu.xml']._export_record_xmls(batch_info)
        self.env['l10n_es_edi_verifactu.xml']._batch_xmls(batch_info)

        return batch_info
