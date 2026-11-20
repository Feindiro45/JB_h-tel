@extends('errors.layout', ['tone' => 'warn'])

@section('code')
{{ isset($exception) && method_exists($exception, 'getStatusCode') ? $exception->getStatusCode() : '400' }}
@endsection
@section('title', 'Demande impossible')
@section('message', 'Cette demande ne peut pas être traitée.')
@section('hint', 'Vérifiez l’adresse, ou revenez à la page précédente.')
@section('actions')
@endsection
