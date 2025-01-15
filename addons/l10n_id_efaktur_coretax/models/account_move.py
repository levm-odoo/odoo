from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from lxml import etree
from odoo.tools import cleanup_xml_node

class AccountMove(models.Model):
    _inherit = "account.move"

    # Extra selection after choosing l10n_id_kode_transaksi 07
    l10n_id_add_info_07 = fields.Selection([
        ('TD.00501', '1 - Pajak Pertambahan Nilai Tidak Dipungut berdasarkan PP Nomor 10 Tahun 2012'),
        ('TD.00502', '2 - Pajak Pertambahan Nilai atau Pajak Pertambahan Nilai dan Pajak Penjualan atas Barang Mewah tidak dipungut'),
        ('TD.00503', '3 - Pajak Pertambahan Nilai dan Pajak Penjualan atas Barang Mewah Tidak Dipungut'),
        ('TD.00504', '4 - Pajak Pertambahan Nilai Tidak Dipungut Sesuai PP Nomor 71 Tahun 2012'),
        ('TD.00505', '5 - (Tidak ada Cap)'),
        ('TD.00506', '6 - PPN dan/atau PPnBM tidak dipungut berdasarkan PMK No. 194/PMK.03/2012'),
        ('TD.00507', '7 - PPN Tidak Dipungut Berdasarkan PP Nomor 15 Tahun 2015'),
        ('TD.00508', '8 - PPN Tidak Dipungut Berdasarkan PP Nomor 69 Tahun 2015'),
        ('TD.00509', '9 - PPN Tidak Dipungut Berdasarkan PP Nomor 96 Tahun 2015'),
        ('TD.00510', '10 - PPN Tidak Dipungut Berdasarkan PP Nomor 106 Tahun 2015'),
        ('TD.00511', '11 - PPN Tidak Dipungut Sesuai PP Nomor 50 Tahun 2019'),
        ('TD.00512', '12 - PPN atau PPN dan PPnBM Tidak Dipungut Sesuai Dengan PP Nomor 27 Tahun 2017'),
        ('TD.00513', '13 - PPN ditanggung PEMERINTAH EX PMK 21/PMK.010/21'),
        ('TD.00514', '14 - PPN DITANGGUNG PEMERINTAH EKS PMK 102/PMK.010/2021'),
        ('TD.00515', '15 - PPN DITANGGUNG PEMERINTAH EKS PMK 239/PMK.03/2020'),
        ('TD.00516', '16 - Insentif PPN DITANGGUNG PEMERINTAH EKSEKUSI PMK NOMOR 103/PMK.010/2021'),
        ('TD.00517', '17 - PAJAK PERTAMBAHAN NILAI TIDAK DIPUNGUT BERDASARKAN PP NOMOR 40 TAHUN 2021'),
        ('TD.00518', '18 - PAJAK PERTAMBAHAN NILAI TIDAK DIPUNGUT BERDASARKAN PP NOMOR 41 TAHUN 2021'),
        ('TD.00519', '19 - PPN DITANGGUNG PEMERINTAH EKS PMK 6/PMK.010/2022'),
        ('TD.00520', '20 - PPN DITANGGUNG PEMERINTAH EKSEKUSI PMK NOMOR 226/PMK.03/2021'),
        ('TD.00521', '21 - PPN ATAU PPN DAN PPnBM TIDAK DIPUNGUT SESUAI DENGAN PP NOMOR 53 TAHUN 2017'),
        ('TD.00522', '22 - PPN tidak dipungut berdasarkan PP Nomor 70 Tahun 2021'),
        ('TD.00523', '23 - PPN ditanggung Pemerintah Ex PMK-125/PMK.01/2020'),
        ('TD.00524', '24 - (Tidak ada Cap)'),
        ('TD.00525', '25 - PPN tidak dipungut berdasarkan PP Nomor 49 Tahun 2022'),
        ('TD.00526', '26 - PPN tidak dipungut berdasarkan PP Nomor 12 Tahun 2023'),
        ('TD.00527', '27 - PPN ditanggung Pemerintah berdasarkan PMK Nomor 38 Tahun 2023'),
    ])
    l10n_id_facility_info_07 = fields.Selection([
        ('TD.01101', '1 - untuk Kawasan Bebas'),
        ('TD.01102', '2 - untuk Tempat Penimbunan Berikat'),
        ('TD.01103', '3 - untuk Hibah dan Bantuan Luar Negeri'),
        ('TD.01104', '4 - untuk Avtur'),
        ('TD.01105', '5 - untuk Lainnya'),
        ('TD.01106', '6 - untuk Kontraktor Perjanjian Karya Pengusahaan Pertambangan Batubara Generasi I'),
        ('TD.01107', '7 - untuk Penyerahan bahan bakar minyak untuk Kapal Angkutan Laut Luar Negeri'),
        ('TD.01108', '8 - untuk Penyerahan jasa kena pajak terkait alat angkutan tertentu'),
        ('TD.01109', '9 - untuk Penyerahan BKP Tertentu di KEK'),
        ('TD.01110', '10 - untuk BKP tertentu yang bersifat strategis berupa anode slime'),
        ('TD.01111', '11 - untuk Penyerahan alat angkutan tertentu dan/atau Jasa Kena Pajak terkait alat angkutan tertentu'),
        ('TD.01112', '12 - untuk Penyerahan kepada Kontraktor Kerja Sama Migas yang mengikuti ketentuan Peraturan Pemerintah Nomor 27 Tahun 2017'),
        ('TD.01113', '13 - Penyerahan Rumah Tapak dan Satuan Rumah Susun Rumah Susun Ditanggung Pemerintah Tahun Anggaran 2021'),
        ('TD.01114', '14 - Penyerahan Jasa Sewa Ruangan atau Bangunan Kepada Pedagang Eceran yang Ditanggung Pemerintah Tahun Anggaran 2021'),
        ('TD.01115', '15 - Penyerahan Barang dan Jasa Dalam Rangka Penanganan Pandemi COVID-19 (PMK 239/PMK. 03/2020)'),
        ('TD.01116', '16 - Insentif PMK-103/PMK.010/2021 berupa PPN atas Penyerahan Rumah Tapak dan Unit Hunian Rumah Susun yang Ditanggung Pemerintah Tahun Anggaran 2021'),
        ('TD.01117', '17 - Kawasan Ekonomi Khusus PP nomor 40 Tahun 2021'),
        ('TD.01118', '18 - Kawasan Bebas PP nomor 41 Tahun 2021'),
        ('TD.01119', '19 - Penyerahan Rumah Tapak dan Unit Hunian Rumah Susun yang Ditanggung Pemerintah Tahun Anggaran 2022'),
        ('TD.01120', '20 - PPN Ditanggung Pemerintah dalam rangka Penanganan Pandemi Corona Virus'),
        ('TD.01121', '21 - Penyerahan kepada Kontraktor Kerja Sama Migas yang mengikuti ketentuan Peraturan Pemerintah Nomor 53 Tahun 2017'),
        ('TD.01122', '22 - BKP strategis tertentu dalam bentuk anode slime dan emas butiran'),
        ('TD.01123', '23 - untuk penyerahan kertas koran dan/atau majalah'),
        ('TD.01124', '24 - PPN tidak dipungut oleh Pemerintah lainnya'),
        ('TD.01125', '25 - BKP dan JKP tertentu'),
        ('TD.01126', '26 - Penyerahan BKP dan JKP di Ibu Kota Negara baru'),
        ('TD.01127', '27 - Penyerahan kendaraan listrik berbasis baterai'),
    ])

    # Extra selection after choosing l10n_id_kode_transaksi 08
    l10n_id_add_info_08 = fields.Selection([
        ('TD.00501', '1 - PPN Dibebaskan Sesuai PP Nomor 146 Tahun 2000 Sebagaimana Telah Diubah Dengan PP Nomor 38 Tahun 2003'),
        ('TD.00502', '2 - PPN Dibebaskan Sesuai PP Nomor 12 Tahun 2001 Sebagaimana Telah Beberapa Kali Diubah Terakhir Dengan PP Nomor 31 Tahun 2007'),
        ('TD.00503', '3 - PPN dibebaskan berdasarkan Peraturan Pemerintah Nomor 28 Tahun 2009'),
        ('TD.00504', '4 - (Tidak ada cap)'),
        ('TD.00505', '5 - PPN Dibebaskan Sesuai Dengan PP Nomor 81 Tahun 2015'),
        ('TD.00506', '6 - PPN Dibebaskan Berdasarkan PP Nomor 74 Tahun 2015'),
        ('TD.00507', '7 - (tanpa cap)'),
        ('TD.00508', '8 - PPN DIBEBASKAN SESUAI PP NOMOR 81 TAHUN 2015 SEBAGAIMANA TELAH DIUBAH DENGAN PP 48 TAHUN 2020'),
        ('TD.00509', '9 - PPN DIBEBASKAN BERDASARKAN PP NOMOR 47 TAHUN 2020'),
        ('TD.00510', '10 - PPN Dibebaskan berdasarkan PP Nomor 49 Tahun 2022'),
    ])

    l10n_id_facility_info_08 = fields.Selection([
        ('TD.01101', '1 - PPN Dibebaskan Sesuai PP Nomor 146 Tahun 2000 Sebagaimana Telah Diubah Dengan PP Nomor 38 Tahun 2003'),
        ('TD.01102', '2 - PPN Dibebaskan Sesuai PP Nomor 12 Tahun 2001 Sebagaimana Telah Beberapa Kali Diubah Terakhir Dengan PP Nomor 31 Tahun 2007'),
        ('TD.01103', '3 - PPN dibebaskan berdasarkan Peraturan Pemerintah Nomor 28 Tahun 2009'),
        ('TD.01104', '4 - (Tidak ada cap)'),
        ('TD.01105', '5 - PPN Dibebaskan Sesuai Dengan PP Nomor 81 Tahun 2015'),
        ('TD.01106', '6 - PPN Dibebaskan Berdasarkan PP Nomor 74 Tahun 2015'),
        ('TD.01107', '7 - (tanpa cap)'),
        ('TD.01108', '8 - PPN DIBEBASKAN SESUAI PP NOMOR 81 TAHUN 2015 SEBAGAIMANA TELAH DIUBAH DENGAN PP 48 TAHUN 2020'),
        ('TD.01109', '9 - PPN DIBEBASKAN BERDASARKAN PP NOMOR 47 TAHUN 2020'),
        ('TD.01110', '10 - PPN Dibebaskan berdasarkan PP Nomor 49 Tahun 2022'),
    ])
    l10n_id_efaktur_available = fields.Boolean(compute="_compute_l10n_id_efaktur_available")

    # Additional Info, only showing up when user chooses code 07/08 and sepcific facility info
    l10n_id_add_info = fields.Char()
    l10n_id_kode_transaksi = fields.Selection(selection_add=[('10', '10 Penyerahan lainnya')])

    l10n_id_stlg_rate = fields.Float(string="STLG Rate", default=0, copy=False)  # luxury good rate

    def _compute_need_kode_transaksi(self):
        """ OVERRIDE: l10n_id_efaktur

        We default all l10n_id_need_kode_transaksi to False, hence not triggering the flow to generate
        tax number and efaktur range consumption
        """
        self.l10n_id_need_kode_transaksi = False

    def _get_efaktur_vals(self):
        """ Get information required for efaktur to be printed on the xml template

        Get information on the invoice, invoice lines and customer information
        """
        invoice_vals = []
        for move in self.filtered(lambda m: m.state == 'posted'):

            commercial_partner = move.partner_id.commercial_partner_id
            trx_code = move.l10n_id_kode_transaksi

            vals = {
                "TIN": move.company_id.vat,
                "TaxInvoiceDate": move.invoice_date.strftime("%Y-%m-%d"),
                "TaxInvoiceOpt": "Normal",
                "TrxCode": trx_code,

                "AddInfo": move['l10n_id_add_info_' + trx_code] if trx_code in ('07', '08') else "",
                "CustomDoc": "",
                "FacilityStamp": move['l10n_id_facility_info_' + trx_code] if trx_code in ('07, 08') else "",

                "RefDesc": move.name,
                "SellerIDTKU": move.company_id.vat + move.company_id.partner_id.l10n_id_tku,
                "BuyerDocument": commercial_partner.l10n_id_buyer_document_type,
                "BuyerTin": commercial_partner.vat if commercial_partner.l10n_id_buyer_document_type == "TIN" else "0000000000000000",
                "BuyerCountry": commercial_partner.country_id.l10n_id_efaktur_code,
                "BuyerDocumentNumber": commercial_partner.l10n_id_buyer_document_number if commercial_partner.l10n_id_buyer_document_type != "TIN" else "",
                "BuyerName": commercial_partner.name,
                "BuyerAdress": commercial_partner.contact_address.replace('\n', ' ').strip(),
                "BuyerEmail": commercial_partner.email or "",
                "BuyerIDTKU": commercial_partner.vat + commercial_partner.l10n_id_tku,
            }

            # Check for AddInfo, FacilityStamp and CustomDoc depending on the l10n_id_kode_transaksi
            vals["lines"] = move.invoice_line_ids._prepare_efaktur_vals()
            invoice_vals.append(vals)

        return invoice_vals

    def l10n_id_efaktur_build_xml(self):
        """ Build the XML tree-string following _export_invoice"""
        vals = self._get_efaktur_vals()
        xml_content = self.env['ir.qweb']._render('l10n_id_efaktur_coretax.efaktur_coretax_template', {'data': vals, 'TIN': self.company_id[:1].vat})
        return etree.tostring(cleanup_xml_node(xml_content, remove_blank_text=False, remove_blank_nodes=False), xml_declaration=True, encoding='UTF-8')

    def _pre_download_validation(self):
        """ Run some checks related to e-Faktur generation, show error if some fields are missing that is required
        in order to generate E-Faktur"""

        for record in self:
            if record.state == 'draft':
                raise ValidationError(_('Could not download E-faktur in draft state'))
            if not record.company_id.vat:
                raise ValidationError(_("Please configre the VAT of your company"))
            if not record.partner_id.l10n_id_pkp:
                raise ValidationError(_("Customer is not eligible for downloading E-Faktur"))
            if not record.partner_id.vat:
                raise ValidationError(_("Please configure the VAT for this customer before generating E-Faktur"))
            # if the partner's chosen document type is not TIN, then has to fill in the document number
            if record.partner_id.l10n_id_buyer_document_type != 'TIN' and not record.partner_id.l10n_id_buyer_document_number:
                raise ValidationError(_("Please fill in the document number according to the document type you've chosen"))
            # if kode transaksi is 07 or 08, some extra checks related to AddInfo, CustomDoc and FacilityStamp
            if record.l10n_id_kode_transaksi == "07":
                if not (record.l10n_id_add_info_07 and record.l10n_id_facility_info_07):
                    raise ValidationError(_("Invoice doesn't contain the Additional info and Facility Stamp yet, (Kode 07)"))
            if record.l10n_id_kode_transaksi == "08":
                if not (record.l10n_id_add_info_08 and record.l10n_id_facility_info_08):
                    raise ValidationError(_("Invoice doesn't contain the Additional info and Facility Stamp yet, (Kode 08)"))

    def download_efaktur(self):
        """ OVERRIDE: l10n_id_efaktur

        New efaktur downloading mechanism will be used. Now it will generate XML instead of csv with
        different field requirements.
        Reference taken from account.edi.xml.ubl._export_invoice method.
        """
        self._pre_download_validation()

        return {
            'type': 'ir.actions.act_url',
            'url': f'/l10n_id_efaktur_coretax/download_efaktur/{",".join(map(str, self.ids))}',
        }

    # for AddInfo and FacilityStamp, (the number has to match each other)

    @api.onchange("l10n_id_add_info_07")
    def _onchange_l10n_id_add_info_07(self):
        if not self.l10n_id_add_info_07:
            self.l10n_id_facility_info_07 = False
        else:
            digit = self.l10n_id_add_info_07[-2:]
            self.l10n_id_facility_info_07 = 'TD.011' + digit

    @api.onchange("l10n_id_facility_info_07")
    def _onchange_l10n_id_facility_info_07(self):
        if not self.l10n_id_facility_info_07:
            self.l10n_id_add_info_07 = False
        else:
            digit = self.l10n_id_facility_info_07[-2:]
            self.l10n_id_add_info_07 = 'TD.005' + digit

    @api.onchange("l10n_id_add_info_08")
    def _onchange_l10n_id_add_info_08(self):
        if not self.l10n_id_add_info_08:
            self.l10n_id_facility_info_08 = False
        else:
            digit = self.l10n_id_add_info_08[-2:]
            self.l10n_id_facility_info_08 = 'TD.011' + digit

    @api.onchange("l10n_id_facility_info_08")
    def _onchange_l10n_id_facility_info_08(self):
        if not self.l10n_id_facility_info_08:
            self.l10n_id_add_info_08 = False
        else:
            digit = self.l10n_id_facility_info_08[-2:]
            self.l10n_id_add_info_08 = 'TD.005' + digit

    @api.depends('partner_id.l10n_id_pkp', 'line_ids.tax_ids')
    def _compute_l10n_id_efaktur_available(self):
        """ Similar use case as l10n_id_kode_transaksi

        helps to check whether or not some buttons should be visible or not
        """
        for move in self:
            move.l10n_id_efaktur_available = (
                move.partner_id.l10n_id_pkp
                and move.country_code == 'ID'
                and move.move_type == 'out_invoice'
                and move.line_ids.tax_ids
            )
