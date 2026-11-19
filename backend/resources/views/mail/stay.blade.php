<x-mail::message>
# {{ $stay->title }}

Bonjour {{ $customerName }},

@foreach ($stay->lines as $line)
{{ $line }}

@endforeach
@if ($stay->details !== [])
<x-mail::table>
| | |
|:--|--:|
@foreach ($stay->details as $label => $value)
| {{ $label }} | **{{ $value }}** |
@endforeach
</x-mail::table>
@endif

@if ($stay->actionUrl)
<x-mail::button :url="$stay->actionUrl" color="success">
{{ $stay->actionLabel }}
</x-mail::button>
@endif

Cordialement,<br>
L’équipe de {{ $hotel }}

<x-slot:subcopy>
Vous recevez ce message car vous avez communiqué votre adresse e-mail à {{ $hotel }} pour votre séjour.
Pour ne plus recevoir ces messages : [se désinscrire]({{ $unsubscribeUrl }}).
</x-slot:subcopy>
</x-mail::message>
