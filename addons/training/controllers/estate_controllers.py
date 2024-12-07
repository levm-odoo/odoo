from odoo import http
from odoo.http import request

class Estate(http.Controller):
    @http.route(['/properties','/properties/page/<int:page>'],type='http', auth='public', website=True)
    def properties_grid(self, page =0,**kw):

            domain = [('state', 'in', ['new', 'offer_received','offer_accepted'])]
            total = http.request.env['estate.property'].sudo().search_count([])
            date = kw.get('create_date')
            if date:
                domain.append(('create_date', '>=', date))
            per_page=6
            pager = request.website.pager(
                url='/properties',
                total=total,
                page=page,
                step=per_page
                )
            properties = http.request.env['estate.property'].search(domain)
            return http.request.render('training.index',{
            'properties': properties.search(domain,limit=per_page, offset=pager['offset'],order='id desc'),'pager':pager})

    @http.route('/properties/<int:id>', auth="public", website=True)
    def property(self, id):
        properties = http.request.env['estate.property']
        return http.request.render('training.description', {
            'properties': properties.search([('id', '=', id)])
        })
