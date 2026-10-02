import { toast } from 'sonner';
import api from './api';

/**
 * Export arbitrary JSON data to an Excel file via the backend.
 * The browser will trigger a download dialog automatically.
 */
export async function exportToExcel(data: object[], filename: string): Promise<void> {
  try {
    const response = await api.post(
      '/reports/export',
      { data, filename },
      { responseType: 'blob' }
    );

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    toast.error('Gagal mengekspor data. Coba lagi.');
  }
}
