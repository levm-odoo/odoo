import { registry } from '@web/core/registry';

function check_price(price, currency) {
    return [
        {
            content: 'Check price',
            trigger: `span.oe_price:contains("${price}")`
        },
        {
            content: 'Check currency',
            trigger: `span[itemprop="priceCurrency"]:contains("${currency}"):not(:visible)`
        },
    ]
}

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_red_sofa_default', {
    steps: () => check_price('1,000.0', 'USD')
});

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_blue_sofa_default', {
    steps: () => check_price('1,200.0', 'USD')
});

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_red_sofa_christmas', {
    steps: () => check_price('990.0', 'EUR') // 1000.0 * 1.1 (EUR rate) - 10% discount
});

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_blue_sofa_christmas', {
    steps: () => check_price('1,188.0', 'EUR') // 1200.0 * 1.1 (EUR rate) - 10% discount
});

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_red_sofa_tax_included', {
    steps: () => check_price('1,150.0', 'USD') // 1000.0 + 15% tax
});

registry.category('web_tour.tours').add('website_sale_gmc_check_advertised_prices_blue_sofa_tax_included', {
    steps: () => check_price('1,380.0', 'USD') // 1200.0 + 15% tax
});