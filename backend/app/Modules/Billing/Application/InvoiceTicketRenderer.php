<?php

namespace App\Modules\Billing\Application;

use App\Modules\Billing\Models\Invoice;
use Barryvdh\DomPDF\Facade\Pdf;
use Dompdf\Frame;

/**
 * Ticket 80 mm (PDF) d'une facture ou d'un avoir, envoyé au client par e-mail (D-065, décision
 * utilisateur : le ticket remplace la facture A4). Construit **uniquement** depuis l'instantané
 * figé, avec le QR code de vérification publique (D-038).
 *
 * Le ticket est une bande continue : un premier rendu mesure la hauteur réelle du contenu, le
 * second produit une page unique de cette hauteur (pas de coupure ni de blanc en bas).
 */
final class InvoiceTicketRenderer
{
    /** 80 mm en points PDF (72 pt par pouce). */
    public const WIDTH_PT = 80 / 25.4 * 72;

    /** Hauteur du premier rendu : largement au-delà du plus long ticket. */
    private const PROBE_HEIGHT_PT = 14400;

    public function __construct(private readonly InvoiceVerification $verification) {}

    public function bytes(Invoice $invoice): string
    {
        $data = [
            'doc' => $invoice->snapshot_json,
            'status' => $invoice->status->value,
            'qr' => $this->verification->qrDataUri($invoice),
            'verificationUrl' => $this->verification->url($invoice),
        ];

        return $this->render($data, $this->contentHeight($data))->output();
    }

    /** @param  array<string, mixed>  $data */
    private function contentHeight(array $data): float
    {
        $height = 0.0;
        $probe = $this->render($data, self::PROBE_HEIGHT_PT, function (Frame $frame) use (&$height): void {
            if (strtolower((string) $frame->get_node()->nodeName) === 'body') {
                $box = $frame->get_border_box();
                $height = max($height, (float) $box['y'] + (float) $box['h']);
            }
        });
        $probe->output();

        // Repli prudent si la mesure échoue : une page A4 de haut.
        return $height > 0 ? ceil($height) + 2 : 842.0;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  (callable(Frame): void)|null  $onFrame
     */
    private function render(array $data, float $height, ?callable $onFrame = null): \Barryvdh\DomPDF\PDF
    {
        $pdf = Pdf::loadView('billing.ticket', $data)
            ->setOption(['isFontSubsettingEnabled' => true, 'defaultFont' => 'DejaVu Sans'])
            ->setPaper([0, 0, self::WIDTH_PT, $height]);
        if ($onFrame !== null) {
            $pdf->getDomPDF()->setCallbacks([['event' => 'end_frame', 'f' => $onFrame]]);
        }

        return $pdf;
    }
}
