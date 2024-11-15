import re
import requests.exceptions
from urllib3.util.ssl_ import create_urllib3_context
from urllib3.contrib.pyopenssl import inject_into_urllib3
from OpenSSL.crypto import load_certificate, load_privatekey, FILETYPE_PEM
from cryptography.hazmat.primitives import serialization
from odoo.addons.l10n_es_edi_sii.models.account_edi_format import PatchedHTTPAdapter as PatchedHTTPAdapterSII

from odoo import api, Command, fields, models


# TODO: taken from sii
# Custom patches to perform the WSDL requests.
# Avoid failure on servers where the DH key is too small
EUSKADI_CIPHERS = "DEFAULT:!DH"
class PatchedHTTPAdapter(requests.adapters.HTTPAdapter):
    """ An adapter to block DH ciphers which may not work for the tax agencies called"""

    def init_poolmanager(self, *args, **kwargs):
        # OVERRIDE
        inject_into_urllib3()
        kwargs['ssl_context'] = create_urllib3_context(ciphers=EUSKADI_CIPHERS)
        return super().init_poolmanager(*args, **kwargs)

    def cert_verify(self, conn, url, verify, cert):
        # OVERRIDE
        # The last parameter is only used by the super method to check if the file exists.
        # In our case, cert is an odoo record 'l10n_es_edi.certificate' so not a path to a file.
        # By putting 'None' as last parameter, we ensure the check about TLS configuration is
        # still made without checking temporary files exist.
        super().cert_verify(conn, url, verify, None)
        conn.cert_file = cert
        conn.key_file = None

    def get_connection(self, url, proxies=None):
        # OVERRIDE
        # Patch the OpenSSLContext to decode the certificate in-memory.
        conn = super().get_connection(url, proxies=proxies)
        context = conn.conn_kw['ssl_context']

        def patched_load_cert_chain(l10n_es_odoo_certificate, keyfile=None, password=None):
            cert_private, cert_public = l10n_es_odoo_certificate._decode_certificate()

            pem_cert_public = cert_public.public_bytes(encoding=serialization.Encoding.PEM)
            pem_pkey = cert_private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
            cert_obj = load_certificate(FILETYPE_PEM, pem_cert_public)
            pkey_obj = load_privatekey(FILETYPE_PEM, pem_pkey)

            context._ctx.use_certificate(cert_obj)
            context._ctx.use_privatekey(pkey_obj)

        context.load_cert_chain = patched_load_cert_chain

        return conn


class L10nEsEdiVerifactuDocument(models.Model):
    _name = 'l10n_es_edi_verifactu.document'
    _description = "Document object representing a Veri*Factu XML"
    _order = 'create_date DESC, id DESC'

    company_id = fields.Many2one(
        comodel_name='res.company',
        default=lambda self: self.env.company,
    )
    move_ids = fields.Many2many(
        comodel_name='account.move',
    )
    document_type = fields.Selection(
        selection=[
            # TODO:?: remove 'registration' and 'cancellation'
            ('registration', 'Registration'),
            ('cancellation', 'Cancellation'),
            ('query', 'query'),
            ('batch', 'Batch'),
        ],
        string='Document Type',
        required=True,
    )
    xml_attachment_id = fields.Many2one(
        comodel_name='ir.attachment',
        string="XML Attachment",
        copy=False,
        readonly=True,
    )
    response_message = fields.Text(
        copy=False,
        readonly=True,
    )
    state = fields.Selection(
        selection=[
            ('sent', 'Sent'),
            ('sending_failed', 'Sending Failed'),
            ('registered_with_errors', 'Registered with Errors'),
                # TODO: currently used for batch and single document
                # TODO:   batch:   any(d.rejected or d.registered_with_errors for d in subdocuments)
                # TODO:          ⇔ not all(subdocuments.mapped('accepted'))
                # TODO:  single: registered but contains some errors
            ('accepted', 'Accepted'),
            ('rejected', 'Rejected'),
        ],
        string='Status',
        copy=False,
    )
    # TODO: ?: remove
    registered = fields.Boolean(
        string="Registered",
        compute='_compute_registered',
        help="Indicated whether the document is registered (potentially with erros) with the AEAT.",
    )
    chain_index = fields.Integer(
        # TODO: needed?
        copy=False,
        readonly=True,
    )

    @api.depends('state')
    def _compute_registered(self):
        for move in self:
            move.registered = move.state in ('registered_with_errors', 'accepted')

    @api.model
    def _create_document(self, xml, moves, document_type):
        # TODO:?: move function to account.move ?
        # TODO:?: override create function to create attachment from `xml`
        doc = self.create({
            'move_ids': [Command.set(moves.ids)],
            'document_type': document_type,
        })
        # create attachment
        attachment = self.env['ir.attachment'].create({
            'raw': xml,
            'name': doc._get_attachment_filename(),
            'res_id': doc.id,
            'res_model': doc._name,
        })
        doc.xml_attachment_id = attachment
        return doc

    def _get_attachment_filename(self):
        self.ensure_one()
        name = f"{self.id}"  # TODO:
        sanitized_name = re.sub(r'[\W_]', '', name)  # remove non-word char or underscores
        return f"verifactu_{self.document_type}_{sanitized_name}.xml"  # TODO:

    def _send(self):
        self.ensure_one()

        if self.document_type not in ('batch', 'query'):
            # TODO: put document_type in the error
            return ["Sending the Veri*Factu document not implemented for the document type."]

        company = self.company_id
        try:
            session = requests.Session()
            session.cert = company.l10n_es_edi_verifactu_certificate_id
            session.mount("https://", PatchedHTTPAdapter())
            soap_xml = self.env['l10n_es_edi_verifactu.xml']._build_soap_request_xml(self.xml_attachment_id.raw)
            response = session.request(
                'post',
                url=company.l10n_es_edi_verifactu_endpoints['verifactu'],
                data=soap_xml,
                timeout=30,  # TODO: for query 5 was not enough
                headers={"Content-Type": 'application/soap+xml;charset=UTF-8'},  # TODO: check
            )
            self.response_message = response.text  # TODO: pretty print in individual parsing functions?
        except requests.exceptions.RequestException as e:
            self.response_message = e
            self.state = 'sending_failed'
            # TODO: better error
            return ["Sending the Veri*Factu document to the AEAT failed."]

        parse_info = self.env['l10n_es_edi_verifactu.response_parser']._parse_response(response, document_type=self.document_type)
        if 'state' not in parse_info:
            parse_info['errors'].append('COULD NOT DETERMINE STATE')  # TODO: remove in production
            parse_info['state'] = 'rejected'  # TODO: ?: 'unknown' state
        self.state = parse_info['state']

        # TODO: store everything in some json field or sth instead of returning errors?
        return parse_info['errors']
