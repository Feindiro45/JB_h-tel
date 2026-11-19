<?php

namespace App\Modules\Billing\Application;

use App\Modules\Billing\Models\Invoice;
use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QRGdImagePNG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Illuminate\Support\Str;

/**
 * Vérification publique d'une facture par QR code (D-036).
 *
 * Le QR code imprimé encode l'adresse publique `…/verification/factures/{uuid}?code={code}`.
 * Une facture n'est trouvée que si l'UUID **et** le code correspondent (comparaison à temps
 * constant) ; dans tous les autres cas, la réponse est la même (« introuvable »), sans indice.
 */
final class InvoiceVerification
{
    public static function newCode(): string
    {
        return Str::random(24);
    }

    public function url(Invoice $invoice): string
    {
        $base = rtrim((string) config('jbhotel.verification_base_url'), '/');

        return $base.'/verification/factures/'.$invoice->uuid.'?code='.$invoice->verification_code;
    }

    public function find(string $uuid, string $code): ?Invoice
    {
        if (! Str::isUuid($uuid) || $code === '') {
            return null;
        }
        $invoice = Invoice::query()->with('creditedInvoice')->where('uuid', $uuid)->first();

        return $invoice !== null && hash_equals($invoice->verification_code, $code) ? $invoice : null;
    }

    /** Image PNG du QR code, en URI `data:` directement intégrable dans le PDF. */
    public function qrDataUri(Invoice $invoice): string
    {
        $options = new QROptions([
            'outputInterface' => QRGdImagePNG::class,
            'outputBase64' => true,
            'eccLevel' => EccLevel::M,
            'scale' => 4,
            'quietzoneSize' => 2,
        ]);

        return (string) (new QRCode($options))->render($this->url($invoice));
    }

    /**
     * Informations publiées : le strict nécessaire pour authentifier le document, sans donnée
     * personnelle complète (le client n'apparaît que par ses initiales).
     *
     * @return array<string, mixed>
     */
    public static function publicView(Invoice $invoice): array
    {
        $snapshot = $invoice->snapshot_json;
        $isCredit = $invoice->type->value === 'CREDIT_NOTE';
        $creditedBy = $isCredit ? null : Invoice::query()->where('credited_invoice_id', $invoice->id)->value('invoice_number');

        return [
            'authentic' => true,
            'type' => $invoice->type->value,
            'type_label' => $invoice->type->label(),
            'number' => $invoice->invoice_number,
            'issued_at' => $invoice->issued_at->toIso8601String(),
            'issuer' => (string) ($snapshot['hotel']['name'] ?? 'JB Hôtel'),
            'net_fcfa' => $invoice->net_fcfa,
            'status' => $invoice->status->value,
            'status_label' => $invoice->status->label(),
            'credited_by_number' => is_string($creditedBy) ? $creditedBy : null,
            'credits_invoice_number' => $isCredit ? $invoice->creditedInvoice?->invoice_number : null,
            'customer_initials' => self::initials((string) ($snapshot['customer']['full_name'] ?? '')),
        ];
    }

    /** « NGAÏKOSSET Awa » → « N. A. » */
    public static function initials(string $fullName): string
    {
        $words = preg_split('/\s+/u', trim($fullName)) ?: [];

        return implode(' ', array_map(
            fn (string $word) => mb_strtoupper(mb_substr($word, 0, 1)).'.',
            array_filter($words, fn (string $word) => $word !== ''),
        ));
    }
}
