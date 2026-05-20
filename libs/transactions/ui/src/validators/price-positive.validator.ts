import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

/**
 * Custom template-driven validator: ensures price/amount is positive (> 0).
 * Usage: <input ngModel appPricePositive />
 */
@Directive({
  selector: '[appPricePositive]',
  standalone: true,
  providers: [
    { provide: NG_VALIDATORS, useExisting: PricePositiveValidatorDirective, multi: true },
  ],
})
export class PricePositiveValidatorDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null; // Let required validator handle empty
    }
    const num = Number(value);
    if (isNaN(num) || num <= 0) {
      return { pricePositive: { actual: value, min: 0.01 } };
    }
    return null;
  }
}
