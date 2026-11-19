<?php

namespace App\Modules\Customers\Http\Controllers;

use App\Modules\Customers\Models\Customer;
use App\Shared\Contracts\AuditTrail;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Désinscription des notifications par e-mail (D-039), depuis le lien présent dans chaque message.
 * Lien **signé** : il ne peut pas être fabriqué pour un autre client. Aucune connexion requise.
 */
final class PublicUnsubscribeController
{
    public function __invoke(string $customer, AuditTrail $audit): Response
    {
        $found = Str::isUuid($customer) ? Customer::query()->where('uuid', $customer)->first() : null;

        if ($found !== null && $found->email_notifications) {
            DB::transaction(function () use ($found, $audit): void {
                $found->forceFill(['email_notifications' => false])->save();
                $audit->record('customer.unsubscribed', 'customer', $found->id, ['email_notifications' => true], ['email_notifications' => false]);
            });
        }

        return response(view('customers.unsubscribed', ['done' => $found !== null])->render(), $found === null ? 404 : 200)
            ->header('X-Robots-Tag', 'noindex, nofollow');
    }
}
