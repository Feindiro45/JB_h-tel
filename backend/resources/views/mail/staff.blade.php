<x-mail::message>
# {{ $heading }}

Bonjour {{ $recipientName }},

@foreach ($lines as $line)
{{ $line }}

@endforeach
@if ($details !== [])
<x-mail::table>
| | |
|:--|--:|
@foreach ($details as $label => $value)
| {{ $label }} | **{{ $value }}** |
@endforeach
</x-mail::table>
@endif

@if ($actionUrl)
<x-mail::button :url="$actionUrl" color="success">
{{ $actionLabel }}
</x-mail::button>
@endif

Cordialement,<br>
{{ $hotel }}

@if ($footnote)
<x-slot:subcopy>
{{ $footnote }}
</x-slot:subcopy>
@endif
</x-mail::message>
