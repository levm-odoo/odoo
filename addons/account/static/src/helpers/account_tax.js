import { roundPrecision } from "@web/core/utils/numbers";

export const accountTaxHelpers = {
    // -------------------------------------------------------------------------
    // HELPERS IN BOTH PYTHON/JAVASCRIPT (account_tax.js / account_tax.py)

    // PREPARE TAXES COMPUTATION
    // -------------------------------------------------------------------------

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_taxes_computation_prepare_product_values(default_product_values, product) {
        const product_values = {};
        for (const [field_name, field_info] of Object.entries(default_product_values)) {
            product_values[field_name] = product
                ? product[field_name] || field_info.default_value
                : field_info.default_value;
        }
        return product_values;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    prepare_taxes_batches(taxes, taxes_data) {
        let batch = [];
        let is_base_affected = null;
        for (const tax of taxes.toReversed()) {
            if (batch.length > 0) {
                const same_batch =
                    tax.amount_type === batch[0].amount_type &&
                    taxes_data[tax.id].price_include === taxes_data[batch[0].id].price_include &&
                    tax.include_base_amount === batch[0].include_base_amount &&
                    ((tax.include_base_amount && !is_base_affected) || !tax.include_base_amount)
                if (!same_batch) {
                    for (const batch_tax of batch) {
                        taxes_data[batch_tax.id].batch = batch;
                    }
                    batch = [];
                }
            }

            is_base_affected = tax.is_base_affected;
            batch.push(tax);
        }

        if (batch.length !== 0) {
            for (const batch_tax of batch) {
                taxes_data[batch_tax.id].batch = batch;
            }
        }
    },

    propagate_extra_taxes_base(taxes, tax, taxes_data, {special_mode = false} = {}) {
        function* get_tax_before() {
            for (let tax_before of taxes) {
                if (taxes_data[tax.id].batch.includes(tax_before)) {
                    break;
                }
                yield tax_before;
            }
        }

        function* get_tax_after() {
            for (let tax_after of taxes.toReversed()) {
                if (taxes_data[tax.id].batch.includes(tax_after)) {
                    break;
                }
                yield tax_after;
            }
        }

        function add_extra_base(other_tax, sign) {
            let tax_amount = taxes_data[tax.id].tax_amount_factorized;
            if (!("tax_amount" in taxes_data[other_tax.id])) {
                taxes_data[other_tax.id].extra_base_for_tax += sign * tax_amount;
            }
            taxes_data[other_tax.id].extra_base_for_base += sign * tax_amount;
        }

        if (tax.price_include) {

            // Case: no special mode
            if (!special_mode) {
                for (let other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }

            // Case: special_mode = 'total_excluded'
            } else if (special_mode === 'total_excluded') {
                for (let other_tax of get_tax_after()) {
                    if (!taxes_data[other_tax.id].price_include) {
                        add_extra_base(other_tax, 1);
                    }
                }

            // Case: special_mode = 'total_included'
            } else if (special_mode === 'total_included') {
                for (let other_tax of get_tax_before()) {
                    add_extra_base(other_tax, -1);
                }
            }

        } else if (!tax.price_include) {

            // Case: special_mode is False or 'total_excluded'
            if (special_mode === null || special_mode === 'total_excluded') {
                if (tax.include_base_amount) {
                    for (let other_tax of get_tax_after()) {
                        add_extra_base(other_tax, 1);
                    }
                }

            // Case: special_mode = 'total_included'
            } else if (special_mode === 'total_included') {
                if (!tax.include_base_amount) {
                    for (let other_tax of get_tax_before()) {
                        add_extra_base(other_tax, -1);
                    }
                    for (let other_tax of get_tax_after()) {
                        add_extra_base(other_tax, -1);
                    }
                }
            }
        }
    },


    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_fixed_amount(tax, batch, raw_base, evaluation_context) {
        if(tax.amount_type === "fixed"){
            return evaluation_context.quantity * tax.amount;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_included(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === 'percent') {
            const total_percentage = batch.reduce((sum, batch_tax) => sum + (batch_tax.total_tax_factor * batch_tax.amount), 0) / 100.0;
            const to_price_excluded_factor = total_percentage !== -1 ? 1 / (1 + total_percentage) : 0.0;
            return raw_base * to_price_excluded_factor * tax.amount / 100.0;
        }

        if (tax.amount_type === 'division') {
            return raw_base * tax.amount / 100.0;
        }
        return null;
    },

    /**
     * [!] Mirror of the same method in account_tax.py.
     * PLZ KEEP BOTH METHODS CONSISTENT WITH EACH OTHERS.
     */
    eval_tax_amount_price_excluded(tax, batch, raw_base, evaluation_context) {
        if (tax.amount_type === 'percent') {
            return raw_base * tax.amount / 100.0;
        }

        if (tax.amount_type === 'division') {
            let total_percentage = batch.reduce((sum, batch_tax) => sum + batch_tax.total_tax_factor * batch_tax.amount, 0) / 100.0;
            let incl_base_multiplicator = total_percentage === 1.0 ? 1.0 : 1 - total_percentage;
            return raw_base * tax.amount / 100.0 / incl_base_multiplicator;
        }
        return null;
    },

    evaluate_taxes_computation(
        taxes,
        price_unit,
        quantity,
        {
            precision_rounding = null,
            rounding_method = "round_per_line",
            // When product is null, we need the product default values to make the "formula" taxes
            // working. In that case, we need to deal with the product default values before calling this
            // method because we have no way to deal with it automatically in this method since it depends of
            // the type of involved fields and we don't have access to this information js-side.
            product = null,
            special_mode = null,
        } = {}
    ){
        const self = this;

        function add_tax_amount_to_results(tax, tax_amount) {
            taxes_data[tax.id].tax_amount = tax_amount;
            taxes_data[tax.id].tax_amount_factorized = tax_amount * tax.total_tax_factor;
            if (rounding_method === "round_per_line") {
                taxes_data[tax.id].tax_amount_factorized = roundPrecision(taxes_data[tax.id].tax_amount_factorized, precision_rounding);
            }

            self.propagate_extra_taxes_base(sorted_taxes, tax, taxes_data, {special_mode: special_mode});
        }

        function eval_tax_amount(tax_amount_function, tax) {
            let is_already_computed = "tax_amount" in taxes_data[tax.id];
            if (is_already_computed) {
                return;
            }

            let tax_amount = tax_amount_function(
                tax,
                taxes_data[tax.id].batch,
                raw_base + taxes_data[tax.id].extra_base_for_tax,
                evaluation_context
            );
            if (tax_amount !== null) {
                add_tax_amount_to_results(tax, tax_amount);
            }
        }

        // Flatten the taxes and order them.
        let taxes_data = {};

        function prepare_tax_extra_data(tax, kwargs = {}) {
            let price_include;
            if (special_mode === 'total_included') {
                price_include = true;
            } else if (special_mode === 'total_excluded') {
                price_include = false;
            } else {
                price_include = tax.price_include;
            }
            return {
                ...kwargs,
                tax: tax,
                price_include: price_include,
                extra_base_for_tax: 0.0,
                extra_base_for_base: 0.0,
            };
        }

        function sort_taxes(taxes){
            return taxes.sort((t1, t2) => t1.sequence - t2.sequence || t1.id - t2.id);
        }

        let sorted_taxes = [];
        for(let tax of sort_taxes(taxes)){
            if (tax.amount_type === 'group') {
                let children = sort_taxes(tax.children_tax_ids);
                for(let child of children){
                    sorted_taxes.push(child);
                    taxes_data[child.id] = prepare_tax_extra_data(child, { group: tax });
                }
            } else {
                sorted_taxes.push(tax);
                taxes_data[tax.id] = prepare_tax_extra_data(tax);
            }
        };

        let raw_base = quantity * price_unit;
        if (rounding_method === 'round_per_line') {
            raw_base = roundPrecision(raw_base, precision_rounding);
        }

        let evaluation_context = {
            product: product || {},
            price_unit: price_unit,
            quantity: quantity,
            raw_base: raw_base,
            special_mode: special_mode,
        };

        // Group the taxes by batch of computation.
        this.prepare_taxes_batches(sorted_taxes, taxes_data);

        // Define the order in which the taxes must be evaluated.
        // Fixed taxes are computed directly because they could affect the base of a price included batch right after.
        for (let tax of sorted_taxes.toReversed()) {
            eval_tax_amount(this.eval_tax_amount_fixed_amount.bind(this), tax);
        }
        
        // Then, let's travel the batches in the reverse order and process the price-included taxes.
        for (let tax of sorted_taxes.toReversed()) {
            if (taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_included.bind(this), tax);
            }
        }
        
        // Then, let's travel the batches in the normal order and process the price-excluded taxes.
        for (let tax of sorted_taxes) {
            if (!taxes_data[tax.id].price_include) {
                eval_tax_amount(this.eval_tax_amount_price_excluded.bind(this), tax);
            }
        }
        
        // Mark the base to be computed in the descending order. The order doesn't matter for no special mode or 'total_excluded' but
        // it must be in the reverse order when special_mode is 'total_included'.
        for (let tax of sorted_taxes.toReversed()) {
            if (!('tax_amount' in taxes_data[tax.id])) {
                continue;
            }
        
            let total_tax_amount = taxes_data[tax.id].batch.reduce((sum, other_tax) =>
                sum + taxes_data[other_tax.id].tax_amount_factorized, 0);
            let base = raw_base + taxes_data[tax.id].extra_base_for_base;
            if (taxes_data[tax.id].price_include && (special_mode === null || special_mode === 'total_included')) {
                base -= total_tax_amount;
            }
            taxes_data[tax.id].base = base;
        }
        
        let taxes_data_list = Object.values(taxes_data).filter(tax_data => 'tax_amount' in tax_data);
        
        let total_excluded, total_included;
        if (taxes_data_list.length > 0) {
            total_excluded = taxes_data_list[0].base;
            let tax_amount = taxes_data_list.reduce((sum, tax_data) => sum + tax_data.tax_amount_factorized, 0);
            total_included = total_excluded + tax_amount;
        } else {
            total_excluded = total_included = raw_base;
        }
        
        return {
            taxes_data: taxes_data_list,
            total_excluded: total_excluded,
            total_included: total_included,
        };
    },

    // -------------------------------------------------------------------------
    // MAPPING PRICE_UNIT
    // -------------------------------------------------------------------------

    adapt_price_unit_to_another_taxes(
        price_unit,
        product,
        original_taxes,
        new_taxes
    ) {
        const original_tax_ids = new Set(original_taxes.map((x) => x.id));
        const new_tax_ids = new Set(new_taxes.map((x) => x.id));
        if (
            (original_tax_ids.size === new_tax_ids.size &&
                [...original_tax_ids].every((value) => new_tax_ids.has(value))) ||
            original_taxes.some((x) => !x.price_include)
        ) {
            return price_unit;
        }

        // Find the price unit without tax.
        let taxes_computation = this.evaluate_taxes_computation(
            original_taxes,
            price_unit,
            1.0,
            {rounding_method: "round_globally", product: product}
        );
        price_unit = taxes_computation.total_excluded;

        // Find the new price unit after applying the price included taxes.
        taxes_computation = this.evaluate_taxes_computation(
            new_taxes,
            price_unit,
            1.0,
            {rounding_method: "round_globally", product: product, special_mode: "total_excluded"}
        );
        let delta = 0.0;
        for(let tax_data of taxes_computation.taxes_data){
            if(tax_data.tax.price_include){
                delta += tax_data.tax_amount_factorized;
            }
        }
        return price_unit + delta;
    },
};
