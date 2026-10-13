import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ClarifyPart } from './types';

interface Props {
  clarify: ClarifyPart;
  /** Ada selama pertanyaan ini masih yang terakhir dan AIRA tidak sedang menjawab. */
  onChoose?: (choice: string) => void;
}

/** Pilihan jawaban untuk pertanyaan balik AIRA; menekan tombol mengirim pilihan itu sebagai pesan. */
export function ClarifyChoices({ clarify, onChoose }: Props) {
  const { t } = useTranslation('aira');
  if (!onChoose) return null;
  return (
    <div role="group" aria-label={t('message.clarifyLabel')} className="space-y-2">
      {clarify.choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clarify.choices.map((choice, i) => (
            <Button key={choice} type="button" size="sm" variant={i === 0 ? 'primary' : 'outline'} onClick={() => onChoose(choice)}>
              {choice}
              {i === 0 && clarify.choices.length > 1 && <span className="text-xs opacity-80">({t('message.recommended')})</span>}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t(clarify.choices.length ? 'message.clarifyOrType' : 'message.clarifyType')}</p>
    </div>
  );
}
