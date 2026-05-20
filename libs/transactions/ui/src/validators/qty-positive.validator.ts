import { Directive } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';

/**
 * Custom template-driven validator: ensures quantity is a positive number (>= 1).
 * Usage: <input ngModel appQtyPositive />
 */
@Directive({
  selector: '[appQtyPositive]',
  standalone: true,
  providers: [
    { provide: NG_VALIDATORS, useExisting: QtyPositiveValidatorDirective, multi: true },
  ],
})
export class QtyPositiveValidatorDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null; // Let required validator handle empty
    }
    const num = Number(value);
    if (isNaN(num) || num < 1) {
      return { qtyPositive: { actual: value, min: 1 } };
    }
    return null;
  }
}
