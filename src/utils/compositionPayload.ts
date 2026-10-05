/**
 * The body-composition write, as a pure function.
 *
 * Split out of `measurementService` so it can be tested without a database, and
 * because the rule it encodes is the sort that gets misread: in a partial write,
 * a column that is absent from the payload is left alone, and one that is present
 * with a `null` is cleared. Two writers share the row -- the Daily Log's two boxes
 * and the Measurements page's full form -- and both need to be able to change one
 * field without touching the rest.
 *
 * Getting this backwards in either direction is a real bug rather than a cosmetic
 * one:
 *
 *  - Dropping nulls (treating them as "not mentioned") means a mistyped weight
 *    cannot be deleted from the Daily Log, and a box that has been emptied puts
 *    the old number straight back.
 *  - Writing every column, nulls included, means saving a weight from the Daily
 *    Log erases the circumferences tape-measured for the same date.
 *
 * `undefined` is "not mentioned". `null` is "there is no reading".
 */
export interface CompositionInput {
    weight?: number | null;
    body_fat?: number | null;
    body_fat_method?: string | null;
}

export const buildCompositionPayload = (
    userId: string,
    measureDate: string,
    input: CompositionInput,
): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
        user_id: userId,
        measure_date: measureDate,
    };

    if (input.weight !== undefined) payload.weight = input.weight;

    if (input.body_fat !== undefined) {
        payload.body_fat = input.body_fat;
        // A body fat that has been removed takes its method with it, or a cleared
        // reading would go on claiming to have been measured on a scale.
        payload.body_fat_method = input.body_fat === null ? null : input.body_fat_method ?? 'manual';
    }

    /**
     * fat_mass is derived from weight and body fat together, so it can only be
     * settled when this call carries both. Losing either reading retires it.
     * Carrying only one of them says nothing about the other, so the column is
     * left alone -- the Measurements page recomputes it from the full form.
     */
    const { weight, body_fat: bodyFat } = input;
    const weightGiven = weight !== undefined;
    const fatGiven = bodyFat !== undefined;
    if (weightGiven || fatGiven) {
        const weightLost = weightGiven && weight === null;
        const fatLost = fatGiven && bodyFat === null;
        if (weightLost || fatLost) {
            payload.fat_mass = null;
        } else if (weightGiven && fatGiven && weight !== null && bodyFat !== null) {
            payload.fat_mass = (weight * bodyFat) / 100;
        }
    }

    return payload;
};