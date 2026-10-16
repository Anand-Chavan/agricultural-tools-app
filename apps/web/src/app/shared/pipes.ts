import { Pipe, PipeTransform } from '@angular/core';
import { formatDateIST, formatINR, uploadUrl } from '../core/api.service';

@Pipe({ name: 'inr', standalone: true })
export class InrPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return formatINR(value);
  }
}

@Pipe({ name: 'istDate', standalone: true })
export class IstDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return formatDateIST(value);
  }
}

@Pipe({ name: 'uploadSrc', standalone: true })
export class UploadSrcPipe implements PipeTransform {
  transform(value: string | null | undefined): string | null {
    return uploadUrl(value);
  }
}
