from lxml import etree

from odoo import api, models

class L10nEsEdiVerifactuResponseParser(models.AbstractModel):
    # TODO: docstring
    _name = 'l10n_es_edi_verifactu.response_parser'
    _description = "Veri*Factu Response Parser"

    @api.model
    def _parse_response(self, response, document_type):
        errors = []
        info = {
            'errors': errors,
            'document_type': document_type,
        }

        self._parse_response_content_type(response, info)
        if info['content_type'] == 'HTML':
            self._parse_html_response(response, info)
        elif info['content_type'] == 'XML':
            self._parse_xml_response(response, info)
        else:
            # TODO: better error message
            errors.append("The response from the AEAT could not be parsed.")

        return info

    @api.model
    def _parse_response_content_type(self, response, info):
        if 'content-type' in response.headers:
            header = response.headers['content-type'].casefold()
            if header.startswith('text/xml'):
                info['content_type'] = 'XML'
            elif header.startswith('text/html'):
                info['content_type'] = 'HTML'

    @api.model
    def _parse_html_response(self, response, info):
        # Since it is a SOAP flow we should only get an HTML response in case of an access error
        # (and get an XML response otherwise)
        html_parser = etree.HTMLParser()
        info['html_tree'] = etree.fromstring(response.text, html_parser)
        self._parse_access_error_response(response, info)
        if not info['errors']:
            # TODO: better error message
            info['errors'].append('Unknown access error')

    @api.model
    def _parse_access_error_response(self, response, info):
        # TODO: parse response.status_code and response.text to determine state etc.
        html_tree = info['html_tree']
        main_node = html_tree.find(".//main")
        # TODO: better error message
        info['errors'].append(etree.tostring(main_node, pretty_print=True, method="html").decode())
        info['state'] = 'rejected'
        return info

    @api.model
    def _parse_xml_response(self, response, info):
        namespaces = {
            'env': "http://schemas.xmlsoap.org/soap/envelope/",
            'tikR': "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd",
            'tik': "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd",
            'tikLRRC': "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaConsultaLR.xsd",
        }
        info.update({
            'xml_tree': etree.fromstring(response.text.encode()),
            'namespaces': namespaces,
        })

        self._parse_response_for_soapfault(response, info)
        if info['errors']:
            return

        document_type = info['document_type']
        if document_type == 'batch':
            self._parse_batch_response(response, info)
        elif document_type == 'query':
            self._parse_query_response(response, info)
        else:
            # TODO:
            info['errors'].append("RESPONSE PARSING NOT IMPLEMENTED FOR DOCUMENT TYPE")

    @api.model
    def _parse_response_for_soapfault(self, response, info):
        errors = info['errors']
        xml_tree = info['xml_tree']
        namespaces = info['namespaces']

        soapfault_node = xml_tree.find(".//env:Fault", namespaces=namespaces)
        if soapfault_node is not None:
            info['state'] = 'rejected'
            # TODO: error messages
            errors.append("soapfault")
            faultcode_node = soapfault_node.find(".//faultcode", namespaces=namespaces)
            faultstring_node = soapfault_node.find(".//faultstring", namespaces=namespaces)
            if faultcode_node is not None and faultstring_node is not None:
                # TODO: error messages
                errors.extend([
                    f"faultcode: {faultcode_node.text}",
                    f"faultstring: {faultstring_node.text}",
                ])

    @api.model
    def _parse_batch_response(self, response, info):
        errors = info['errors']
        xml_tree = info['xml_tree']
        namespaces = info['namespaces']

        registration_node = xml_tree.find("env:Body/tikR:RespuestaRegFactuSistemaFacturacion", namespaces=namespaces)
        if registration_node is None:
            errors.append("Could not parse registration response; it is malformed.")
            return

        waiting_time_node = registration_node.find("tikR:TiempoEsperaEnvio", namespaces=namespaces)
        try:
            info['waiting_time_seconds'] = int(waiting_time_node.text)  # TODO: use / respect parsed value
        except ValueError:
            errors.append("Could not parse waiting time.")  # Should not happen

        batch_status_node = registration_node.find("tikR:EstadoEnvio", namespaces=namespaces)
        if batch_status_node is not None:
            batch_status = batch_status_node.text.strip()
            batch_state = {
                'Incorrecto': 'rejected',
                'ParcialmenteCorrecto': 'registered_with_errors',
                'Correcto': 'accepted',
               }.get(batch_status, None)
            if batch_state is None:
                # TODO: as of writing all possible values are implemented for EstadoEnvio
                errors.append("BATCH STATUS NOT IMPLEMENTED")
        info['state'] = batch_state or 'rejected'

        # TODO: match to individual invoices
        for element in registration_node.iterfind("tikR:RespuestaLinea", namespaces=namespaces):
            # TODO: extract subdocument name (or maybe even browse it)
            status_node = element.find("tikR:EstadoRegistro", namespaces=namespaces)
            status = status_node.text.strip()
            subdocument_state = {
                'Incorrecto': 'rejected',
                'AceptadoConErrores': 'registered_with_errors',
                'Correcto': 'acccepted',
            }.get(status, None)
            if subdocument_state is None:
                # TODO: as of writing all possible values are implemented for EstadoRegistro
                errors.append("STATUS NOT IMPLEMENTED")
                subdocument_state = 'rejected'
            elif subdocument_state in ('rejected', 'registered_with_errors'):
                code_node = element.find("tikR:CodigoErrorRegistro", namespaces=namespaces)
                description_node = element.find("tikR:DescripcionErrorRegistro", namespaces=namespaces)
                if code_node is not None and description_node is not None:
                    errors.extend([
                        f"code: {code_node.text}",
                        f"description: {description_node.text}",
                    ])

    @api.model
    def _parse_query_response(self, response, info):
        errors = info['errors']
        xml_tree = info['xml_tree']
        namespaces = info['namespaces']

        query_node = xml_tree.find("env:Body/tikLRRC:RespuestaConsultaFactuSistemaFacturacion", namespaces=namespaces)
        if query_node is None:
            errors.append("Could not parse query response; it is malformed")
            return

        info['state'] = 'accepted'

        # TODO: match to existing invoices
        for element in query_node.iterfind("tikLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion", namespaces=namespaces):
            # TODO:
            id_node = element.find("tikLRRC:IDFactura", namespaces=namespaces)
            if id_node is None:
                continue
            name_node = id_node.find("tikLRRC:NumSerieFactura", namespaces=namespaces)
            if name_node is None:
                continue
            errors.append(f"found: {name_node.text}")

        # TODO: pagination / re-query needed
