// modelName -> id -> Change
const allChanges = new Map();

export function createOnChangeHandler(model, field, getKey, handler) {
    return (record, payload) => {
        if (!allChanges.has(model.name)) {
            allChanges.set(model.name, new Map());
        }
        const changeContainer = allChanges.get(model.name);
        const key = getKey(record);
        if (!changeContainer.has(key)) {
            changeContainer.set(key, {});
        }
        let changes = changeContainer.get(key);
        handler(
            record,
            field,
            {
                set: (key, value) => {
                    changes[key] = value;
                },
                clear: () => {
                    changes = {};
                },
                get: () => changes,
            },
            payload
        );
    };
}
