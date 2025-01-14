/* global checkVATNumber */

import { loadJS } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { KeepLast } from "@web/core/utils/concurrency";
import { useService } from "@web/core/utils/hooks";
import { renderToMarkup } from "@web/core/utils/render";
import { getDataURLFromFile } from "@web/core/utils/urls";

/**
 * Get list of companies via Autocomplete API
 *
 * @param {string} value
 * @returns {Promise}
 * @private
 */
export function usePartnerAutocomplete() {
    const keepLastOdoo = new KeepLast();

    const http = useService("http");
    const notification = useService("notification");
    const orm = useService("orm");

    async function autocomplete(value) {
        value = value.trim();

        return new Promise((resolve, reject) => {
            getOdooSuggestions(value).then((suggestions) => {
                const odooSuggestions = suggestions.filter((suggestion) => {
                    return !suggestion.ignored;
                });
                resolve(odooSuggestions);
            });
        });
    }

    /**
     * Get enrichment data
     *
     * @param {Object} company
     * @returns {Promise}
     * @private
     */
    function enrichCompany(company) {
        return orm.call(
            'res.partner',
            'enrich_company',
            [company.duns]
        );
    }

    /**
     * Get enriched data before populating partner form
     *
     * @param {Object} company
     * @returns {Promise}
     */
    function getCreateData(company) {
        return new Promise((resolve) => {
            // Fetch additional company info via Autocomplete Enrichment API
            const enrichPromise = !company.skip_enrich ? enrichCompany(company) : false;

            enrichPromise.then((company_data) => {
                if (company_data.error) {
                    if (company_data.error_message === 'Insufficient Credit') {
                        notifyNoCredits();
                    }
                    else if (company_data.error_message === 'No Account Token') {
                        notifyAccountToken();
                    }
                    else {
                        notification.add(company_data.error_message);
                    }
                    if (company_data.city !== undefined) {
                        company.city = company_data.city;
                    }
                    if (company_data.street !== undefined) {
                        company.street = company_data.street;
                    }
                    if (company_data.zip !== undefined) {
                        company.zip = company_data.zip;
                    }
                    company_data = company;
                }

                if (!Object.keys(company_data).length) {
                    company_data = company;
                }

                resolve({
                    company: company_data,
                });
            });
        });
    }

    /**
     * Use Odoo Autocomplete API to return suggestions
     *
     * @param {string} value
     * @param {boolean} isVAT
     * @returns {Promise}
     * @private
     */
    async function getOdooSuggestions(value, isVAT) {
        const prom = orm.silent.call(
            'res.partner',
            'autocomplete',
            [value],
        );

        const suggestions = await keepLastOdoo.add(prom);
        suggestions.map((suggestion) => {
            suggestion.label = suggestion.name;
            suggestion.description = '';
            if (suggestion.city){
                suggestion.description += suggestion.city + ', ';
            }
            if (suggestion.country_id && suggestion.country_id.display_name) {
                suggestion.description += suggestion.country_id.display_name;
            }
            return suggestion;
        });
        return suggestions;
    }

    /**
     * @private
     * @returns {Promise}
     */
    async function notifyNoCredits() {
        const url = await orm.call(
            'iap.account',
            'get_credits_url',
            ['partner_autocomplete'],
        );
        const title = _t('Not enough credits for Partner Autocomplete');
        const content = renderToMarkup('partner_autocomplete.InsufficientCreditNotification', {
            credits_url: url
        });
        notification.add(content, {
            title,
        });
    }

    async function notifyAccountToken() {
        const url = await orm.call(
            'iap.account',
            'get_config_account_url',
            []
        );
        const title = _t('IAP Account Token missing');
        if (url) {
            const content = renderToMarkup('partner_autocomplete.AccountTokenMissingNotification', {
                account_url: url
            });
            notification.add(content, {
                title,
            });
        }
        else {
            notification.add(title);
        }
    }
    return { autocomplete, getCreateData };
}
