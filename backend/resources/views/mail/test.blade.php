<x-mail::message>
# L’envoi des e-mails fonctionne

Ce message confirme que {{ $hotel }} peut envoyer des e-mails : confirmations de séjour, reçus, factures, alertes de connexion et invitations du personnel.

<x-mail::table>
| | |
|:--|--:|
| Envoyé le | **{{ $sentAt }}** |
@if ($requestedBy)
| Demandé par | **{{ $requestedBy }}** |
@endif
</x-mail::table>

Aucune action n’est nécessaire.

Cordialement,<br>
{{ $hotel }}
</x-mail::message>
