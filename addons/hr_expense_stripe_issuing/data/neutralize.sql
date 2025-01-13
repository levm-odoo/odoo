-- disable stripe issuing
UPDATE res_company
    SET stripe_issuing_api_key = NULL
